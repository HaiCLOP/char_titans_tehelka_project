import "server-only";
import { tool, type FlexibleSchema } from "ai";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { z } from "zod";
import { CATEGORIES, OPEN_STATUSES, type Category } from "@/lib/domain";
import en from "../../../messages/en.json";
import as from "../../../messages/as.json";
import {
  ByCategoryInput, ByCategoryOutput, DepartmentLoadInput, DepartmentLoadOutput, GetComplaintInput, GetComplaintOutput,
  ListComplaintsInput, ListComplaintsOutput, StatsInput, StatsOutput, TopLocationsInput, TopLocationsOutput,
  TrendInput, TrendOutput, type AgentTrace, type ToolName,
} from "./schema";
import { canCompareDepartments, type AgentScope } from "./scope";

/*
 * Read-only agent tools (PRD section 9). Every query is scoped here, on the server, from `scope`:
 * the department filter is applied explicitly to every RPC and table read (RLS on the caller's client is a
 * second layer, not the only one). The model picks only windows and filters — never SQL, never the department.
 * Rows returned to the model carry safe fields only: no user ids, no original text, no AI metadata.
 */

const CLOSED = ["resolved", "closed", "rejected", "duplicate"];
const label = (c: Category) => ({ label_en: en.category[c] ?? c, label_as: as.category[c] ?? c });
const since = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString();
const n = (v: unknown) => Math.max(0, Math.trunc(Number(v ?? 0)) || 0);

type LocationRow = { id: string; name_en: string; name_as: string; type: string | null };
type DeptRow = { id: string; name_en: string; name_as: string };

/** Filled while the model calls tools: the UI trace, and the validated outputs (for the chart). */
export type ToolSink = { trace: AgentTrace[]; outputs: { tool: ToolName; out: unknown }[] };

function check<T>(error: { message: string } | null, data: T): T {
  if (error) throw new Error(`query failed: ${error.message}`);
  return data;
}

export function buildAgentTools(db: SupabaseClient, scope: AgentScope, sink: ToolSink) {
  const dept = scope.departmentId;
  let locCache: Promise<Map<string, LocationRow>> | null = null;
  const locations = () =>
    (locCache ??= Promise.resolve(db.from("locations").select("id, name_en, name_as, type")).then(({ data, error }) =>
      new Map((check(error, data ?? []) as LocationRow[]).map((l) => [l.id, l])),
    ));
  let deptCache: Promise<Map<string, DeptRow>> | null = null;
  const departments = () =>
    (deptCache ??= Promise.resolve(db.from("departments").select("id, name_en, name_as")).then(({ data, error }) =>
      new Map((check(error, data ?? []) as DeptRow[]).map((d) => [d.id, d])),
    ));
  /** complaints_admin hides anonymous reporters; the explicit department filter is the scope. */
  const complaints = (columns: string) => {
    const q = db.from("complaints_admin").select(columns, { count: "exact" });
    return dept ? q.eq("department_id", dept) : q;
  };

  /** Wraps execute: validates the output with Zod and records a trace entry the UI can show. */
  function traced<I extends z.ZodType, O extends z.ZodType>(
    name: ToolName,
    description: string,
    inputSchema: I,
    outputSchema: O,
    run: (input: z.output<I>) => Promise<z.input<O>>,
    summarize: (out: z.output<O>) => Pick<AgentTrace, "rows" | "top">,
  ) {
    return tool<z.output<I>, unknown, Record<string, unknown>>({
      description,
      inputSchema: inputSchema as unknown as FlexibleSchema<z.output<I>>,
      execute: async (input: z.output<I>): Promise<unknown> => {
        const started = Date.now();
        try {
          const out = outputSchema.parse(await run(input)) as z.output<O>;
          sink.trace.push({ tool: name, input: input as Record<string, unknown>, ok: true, ms: Date.now() - started, ...summarize(out) });
          sink.outputs.push({ tool: name, out });
          return out;
        } catch (e) {
          const msg = e instanceof Error ? e.message.slice(0, 200) : "failed";
          sink.trace.push({ tool: name, input: input as Record<string, unknown>, ok: false, ms: Date.now() - started, rows: 0, top: null, error: msg });
          return { error: "This data could not be loaded. Tell the user it is unavailable right now." };
        }
      },
    });
  }

  const stats = traced(
    "stats",
    "Headline numbers for the period: complaints created and resolved in the last `days`, plus open, in-progress and overdue right now and the average resolution time.",
    StatsInput, StatsOutput,
    async ({ days }) => {
      const [s, t] = await Promise.all([db.rpc("dashboard_stats", { dept }), db.rpc("trend_by_day", { dept, days })]);
      const snap = (check(s.error, s.data) ?? {}) as Record<string, unknown>;
      const series = (check(t.error, t.data) ?? []) as { created: number; resolved: number }[];
      const byLang = (snap.by_lang ?? {}) as Record<string, unknown>;
      return {
        period_days: days,
        created_in_period: series.reduce((a, r) => a + n(r.created), 0),
        resolved_in_period: series.reduce((a, r) => a + n(r.resolved), 0),
        open_now: n(snap.open) + n(snap.in_progress), // everything not yet resolved
        in_progress_now: n(snap.in_progress),
        overdue_now: n(snap.overdue),
        avg_resolution_hours: snap.avg_resolution_hours == null ? null : Number(snap.avg_resolution_hours),
        by_language_all_time: { en: n(byLang.en), as: n(byLang.as) },
      };
    },
    () => ({ rows: 1, top: null }),
  );

  const trend = traced(
    "trend",
    "Complaints created and resolved per day over the last `days` days (a time series).",
    TrendInput, TrendOutput,
    async ({ days }) => {
      const { data, error } = await db.rpc("trend_by_day", { dept, days });
      const rows = (check(error, data) ?? []) as { day: string; created: number; resolved: number }[];
      return { period_days: days, series: rows.map((r) => ({ day: String(r.day), created: n(r.created), resolved: n(r.resolved) })) };
    },
    (o) => ({ rows: o.series.length, top: null }),
  );

  const topLocations = traced(
    "top_locations",
    "Campus buildings/places ranked by number of complaints created in the last `days` days (total, and how many are still open). Use location_type \"hostel\" for questions about hostels.",
    TopLocationsInput, TopLocationsOutput,
    async ({ days, category, location_type }) => {
      const locs = await locations();
      let rows: { id: string; total: number; open: number }[];
      if (!category) {
        const { data, error } = await db.rpc("top_locations", { dept, days, lim: 100 });
        rows = ((check(error, data) ?? []) as { location_id: string; total: number; open_count: number }[]).map((r) => ({
          id: r.location_id, total: n(r.total), open: n(r.open_count),
        }));
      } else {
        const { data, error } = await complaints("location_id, status").eq("category", category).gte("created_at", since(days)).not("location_id", "is", null);
        const agg = new Map<string, { id: string; total: number; open: number }>();
        for (const r of (check(error, data) ?? []) as unknown as { location_id: string; status: string }[]) {
          const a = agg.get(r.location_id) ?? { id: r.location_id, total: 0, open: 0 };
          a.total += 1;
          if (!CLOSED.includes(r.status)) a.open += 1;
          agg.set(r.location_id, a);
        }
        rows = [...agg.values()];
      }
      return {
        period_days: days,
        category: category ?? null,
        location_type: location_type ?? null,
        rows: rows
          .map((r) => ({ ...r, loc: locs.get(r.id) }))
          .filter((r) => r.loc && (!location_type || r.loc.type === location_type))
          .sort((a, b) => b.total - a.total || b.open - a.open)
          .slice(0, 10)
          .map((r) => ({ name_en: r.loc!.name_en, name_as: r.loc!.name_as, type: r.loc!.type, total: r.total, open: r.open })),
      };
    },
    (o) => ({ rows: o.rows.length, top: o.rows[0] ? { label_en: o.rows[0].name_en, label_as: o.rows[0].name_as, value: o.rows[0].total } : null }),
  );

  const byCategory = traced(
    "by_category",
    "Number of complaints per category created in the last `days` days. Categories with no complaints are listed with 0.",
    ByCategoryInput, ByCategoryOutput,
    async ({ days }) => {
      const { data, error } = await db.rpc("category_breakdown", { dept, days });
      const got = new Map(((check(error, data) ?? []) as { category: Category; total: number }[]).map((r) => [r.category, n(r.total)]));
      return {
        period_days: days,
        rows: CATEGORIES.map((c) => ({ category: c, ...label(c), total: got.get(c) ?? 0 })).sort((a, b) => b.total - a.total),
      };
    },
    (o) => ({ rows: o.rows.filter((r) => r.total > 0).length, top: o.rows[0]?.total ? { label_en: o.rows[0].label_en, label_as: o.rows[0].label_as, value: o.rows[0].total } : null }),
  );

  const departmentLoad = traced(
    "department_load",
    "Compare departments: complaints created in the last `days` days per department, plus open and overdue right now.",
    DepartmentLoadInput, DepartmentLoadOutput,
    async ({ days }) => {
      if (!canCompareDepartments(scope)) throw new Error("department comparison is only available to a super admin viewing all departments");
      const [load, recent] = await Promise.all([
        db.rpc("department_load"),
        db.from("complaints_admin").select("department_id").gte("created_at", since(days)),
      ]);
      const counts = new Map<string, number>();
      for (const r of (check(recent.error, recent.data) ?? []) as { department_id: string | null }[]) {
        if (r.department_id) counts.set(r.department_id, (counts.get(r.department_id) ?? 0) + 1);
      }
      const rows = ((check(load.error, load.data) ?? []) as { department_id: string; name_en: string; name_as: string; open_count: number; overdue: number }[])
        .map((d) => ({ name_en: d.name_en, name_as: d.name_as, total_in_period: counts.get(d.department_id) ?? 0, open_now: n(d.open_count), overdue_now: n(d.overdue) }))
        .sort((a, b) => b.total_in_period - a.total_in_period || b.open_now - a.open_now);
      return { period_days: days, rows };
    },
    (o) => ({ rows: o.rows.filter((r) => r.total_in_period > 0).length, top: o.rows[0]?.total_in_period ? { label_en: o.rows[0].name_en, label_as: o.rows[0].name_as, value: o.rows[0].total_in_period } : null }),
  );

  const SAFE = "code, title_en, title_as, category, priority, status, location_id, original_lang, created_at";
  type SafeRow = { code: string; title_en: string | null; title_as: string | null; category: Category; priority: number; status: string; location_id: string | null; original_lang: string; created_at: string };
  const safe = (r: SafeRow, locs: Map<string, LocationRow>) => {
    const l = r.location_id ? locs.get(r.location_id) : undefined;
    return {
      code: r.code, title_en: r.title_en, title_as: r.title_as, category: r.category, priority: r.priority,
      status: r.status as never, location_en: l?.name_en ?? null, location_as: l?.name_as ?? null,
      original_lang: r.original_lang, created_at: r.created_at,
    };
  };

  const listComplaints = traced(
    "list_complaints",
    "List individual complaints (newest first, at most 20) with optional filters. Returns the total number of matches too.",
    ListComplaintsInput, ListComplaintsOutput,
    async ({ days, status, category, priority, location, lang, limit }) => {
      const locs = await locations();
      let q = complaints(SAFE).gte("created_at", since(days)).is("parent_id", null);
      if (status === "open") q = q.in("status", [...OPEN_STATUSES]);
      else if (status) q = q.eq("status", status);
      if (category) q = q.eq("category", category);
      if (priority) q = q.eq("priority", priority);
      if (lang) q = q.eq("original_lang", lang);
      if (location) {
        const needle = location.toLowerCase();
        const ids = [...locs.values()].filter((l) => l.name_en.toLowerCase().includes(needle) || l.name_as.includes(location)).map((l) => l.id);
        if (ids.length === 0) return { period_days: days, total_matching: 0, rows: [] };
        q = q.in("location_id", ids);
      }
      const { data, error, count: total } = await q.order("created_at", { ascending: false }).limit(limit);
      const rows = (check(error, data) ?? []) as unknown as SafeRow[];
      return { period_days: days, total_matching: total ?? rows.length, rows: rows.map((r) => safe(r, locs)) };
    },
    (o) => ({ rows: o.total_matching, top: null }),
  );

  const getComplaint = traced(
    "get_complaint",
    "Details of one complaint by its ticket code (CS-XXXXXX).",
    GetComplaintInput, GetComplaintOutput,
    async ({ code }) => {
      const [locs, depts] = await Promise.all([locations(), departments()]);
      const { data, error } = await complaints(`${SAFE}, summary_en, summary_as, department_id, metoo_count, sla_due_at, resolved_at`)
        .eq("code", code.toUpperCase())
        .maybeSingle();
      const r = check(error, data) as unknown as (SafeRow & { summary_en: string | null; summary_as: string | null; department_id: string | null; metoo_count: number; sla_due_at: string | null; resolved_at: string | null }) | null;
      if (!r) return { found: false, complaint: null };
      const d = r.department_id ? depts.get(r.department_id) : undefined;
      return {
        found: true,
        complaint: {
          ...safe(r, locs),
          summary_en: r.summary_en, summary_as: r.summary_as,
          department_en: d?.name_en ?? null, department_as: d?.name_as ?? null,
          metoo_count: n(r.metoo_count), sla_due_at: r.sla_due_at, resolved_at: r.resolved_at,
          overdue: !!r.sla_due_at && new Date(r.sla_due_at) < new Date() && !CLOSED.includes(r.status),
        },
      };
    },
    (o) => ({ rows: o.found ? 1 : 0, top: null }),
  );

  return {
    stats,
    trend,
    top_locations: topLocations,
    by_category: byCategory,
    list_complaints: listComplaints,
    get_complaint: getComplaint,
    // Not even offered to the model unless the caller may compare departments.
    ...(canCompareDepartments(scope) ? { department_load: departmentLoad } : {}),
  };
}

export type AgentTools = ReturnType<typeof buildAgentTools>;
