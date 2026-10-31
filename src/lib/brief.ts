import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { generateText, Output } from "ai";
import { z } from "zod";
import { scopeDepartment } from "@/lib/admin";
import { glossaryText } from "@/lib/ai/glossary";
import { AIUnavailableError, runAI } from "@/lib/ai/router";
import { PipelineError } from "@/lib/complaints";
import type { Profile } from "@/lib/domain";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasBengaliDrift } from "@/lib/utils";

/**
 * AI daily brief (PRD section 9, S13 card). 3 bullets in English + the same 3 in Assamese, grounded only in
 * aggregate numbers (counts per status, category and building) — never ticket text, names or photos.
 *
 * Cache (ai_cache, service role — ai_* tables have no RLS policies by design), 1 hour:
 * - `daily_brief`            written every hour by the Go engine worker for all departments
 * - `daily_brief:all`        written here when the engine's row is missing or stale (super admin, all departments)
 * - `daily_brief:<dept_id>`  written here for a department-scoped brief (dept_admin, or super admin ?department=)
 */

const TTL_MS = 60 * 60 * 1000;
const FAIL_BACKOFF_MS = 2 * 60 * 1000;
const ENGINE_HASH = "daily_brief";
/** Fewer new complaints than this in 24 h = a quiet day. */
const QUIET_BELOW = 3;

const Bullets = z.array(z.string().trim().min(3).max(300)).length(3);
export const BriefSchema = z.object({
  en: Bullets,
  as: Bullets,
  generated_at: z.string().min(10),
  model: z.string().min(1),
});
export type Brief = z.infer<typeof BriefSchema>;
export type BriefResult = Brief & { department_id: string | null; cached: boolean };

const ModelOutput = z.object({ en: Bullets, as: Bullets });

const g = globalThis as { __briefInflight?: Map<string, Promise<Brief>>; __briefFailedAt?: Map<string, number> };
const inflight = (g.__briefInflight ??= new Map());
const failedAt = (g.__briefFailedAt ??= new Map());

const hashFor = (dept: string | null) => `daily_brief:${dept ?? "all"}`;

/** A fresh cached brief for these hashes (first match wins), or null. */
async function readCache(hashes: string[]): Promise<Brief | null> {
  const { data, error } = await createAdminClient().from("ai_cache").select("hash, response, expires_at").in("hash", hashes);
  if (error) {
    console.error("[brief] cache read failed", error.code, error.message);
    return null;
  }
  const rows = (data ?? []) as { hash: string; response: unknown; expires_at: string | null }[];
  for (const h of hashes) {
    const row = rows.find((r) => r.hash === h);
    if (!row?.expires_at || new Date(row.expires_at).getTime() <= Date.now()) continue;
    const parsed = BriefSchema.safeParse(row.response);
    if (parsed.success) return parsed.data;
  }
  return null;
}

/**
 * Public variant for the home page: only the cached all-departments brief (engine or web), never generated
 * on a public request so signed-out traffic cannot spend AI quota.
 */
export async function getCachedCampusBrief(): Promise<Brief | null> {
  try {
    return await readCache([ENGINE_HASH, hashFor(null)]);
  } catch {
    return null;
  }
}

const SYSTEM = (strict: boolean) => `You write a short daily brief for campus complaint administrators at Dibrugarh University, Assam.
Input is JSON with aggregate statistics: the last 24 hours plus current open counts, for one department or for all departments.
Return JSON only: {"en": [3 strings], "as": [3 strings]}.
Rules:
- Exactly 3 bullets per language, each under 25 words, factual, based ONLY on the numbers given. Never invent numbers, names, causes or buildings.
- Bullet 1: overall load (open, overdue). Bullet 2: the biggest category or building in the last 24 hours. Bullet 3: one concrete, modest suggestion that follows from the numbers.
- If "quiet_day" is true, bullet 1 must say plainly that it was a quiet day (in Assamese: শান্ত দিন), then give the counts. Do not dramatise small numbers.
- If a list is empty, say there was nothing new rather than guessing.
- Write numbers as digits. No markdown, no emoji, no bullet symbols at the start.
- "as" is the same 3 bullets in Assamese (অসমীয়া), not Bengali. Use ৰ (never র) and ৱ. Natural, simple office Assamese.
- Use these fixed terms: ${glossaryText()}.${strict ? "\n- YOUR PREVIOUS ANSWER USED BENGALI LETTERS. Write ৰ for every 'r' sound and ৱ for 'w'. Never output র." : ""}`;

type Client = SupabaseClient;

/** Aggregates only, read with the caller's RLS client (the RPCs are security definer and take the department explicitly). */
async function collectStats(supabase: Client, dept: string | null) {
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const count = (col: "created_at" | "resolved_at") => {
    let q = supabase.from("complaints").select("id", { count: "exact", head: true }).is("parent_id", null).gte(col, since);
    if (dept) q = q.eq("department_id", dept);
    return q;
  };
  const [dash, cats, locs, created, resolved, deptRow] = await Promise.all([
    supabase.rpc("dashboard_stats", { dept }),
    supabase.rpc("category_breakdown", { dept, days: 1 }),
    supabase.rpc("top_locations", { dept, days: 1, lim: 5 }),
    count("created_at"),
    count("resolved_at"),
    dept ? supabase.from("departments").select("name_en").eq("id", dept).maybeSingle() : Promise.resolve({ data: null, error: null }),
  ]);
  const err = [dash, cats, locs, created, resolved, deptRow].find((r) => r.error)?.error;
  if (err) {
    console.error("[brief] stats failed", err.code, err.message);
    throw new PipelineError("INTERNAL", "Could not load the numbers for the brief");
  }
  const d = (dash.data ?? {}) as Record<string, unknown>;
  const newCount = created.count ?? 0;
  return {
    scope: dept ? `department: ${(deptRow.data as { name_en?: string } | null)?.name_en ?? "one department"}` : "all departments",
    open_now: { waiting: Number(d.open ?? 0), in_progress: Number(d.in_progress ?? 0), overdue: Number(d.overdue ?? 0) },
    avg_resolution_hours_all_time: d.avg_resolution_hours ?? null,
    quiet_day: newCount < QUIET_BELOW,
    last_24h: {
      new_complaints: newCount,
      fixed: resolved.count ?? 0,
      by_category: ((cats.data ?? []) as { category: string; total: number }[]).map((c) => ({ category: c.category, count: Number(c.total) })),
      top_buildings: ((locs.data ?? []) as { name_en: string; open_count: number; total: number }[]).map((l) => ({
        building: l.name_en,
        new: Number(l.total),
        still_open: Number(l.open_count),
      })),
    },
  };
}

async function generate(supabase: Client, dept: string | null): Promise<Brief> {
  const stats = await collectStats(supabase, dept);
  const prompt = `Statistics JSON:\n${JSON.stringify(stats)}`;
  const ask = (strict: boolean) =>
    runAI("daily_brief", async ({ languageModel, abortSignal }) => {
      const { output } = await generateText({
        model: languageModel(),
        system: SYSTEM(strict),
        prompt,
        output: Output.object({ schema: ModelOutput }),
        abortSignal,
      });
      return output;
    });

  let r = await ask(false);
  if (hasBengaliDrift(r.result.as.join(""))) {
    try {
      r = await ask(true);
    } catch {
      /* keep the first answer, fixed below */
    }
    if (hasBengaliDrift(r.result.as.join(""))) r = { ...r, result: { ...r.result, as: r.result.as.map((s) => s.replaceAll("র", "ৰ")) } };
  }
  const brief = BriefSchema.parse({ ...r.result, generated_at: new Date().toISOString(), model: r.model });

  const { error } = await createAdminClient()
    .from("ai_cache")
    .upsert({ hash: hashFor(dept), purpose: "daily_brief", response: brief, expires_at: new Date(Date.now() + TTL_MS).toISOString() });
  if (error) console.error("[brief] cache write failed", error.code, error.message);
  return brief;
}

/**
 * GET /api/admin/brief. dept_admin: always their department. super_admin: all departments (engine cache first)
 * or `requested`. Cached for 1 hour per scope; concurrent requests share one generation.
 */
export async function getAdminBrief(supabase: Client, profile: Profile, requested?: string | null): Promise<BriefResult> {
  const dept = scopeDepartment(profile, requested);
  const hash = hashFor(dept);
  const cached = await readCache(dept ? [hash] : [ENGINE_HASH, hash]);
  if (cached) return { ...cached, department_id: dept, cached: true };

  const last = failedAt.get(hash) ?? 0;
  if (Date.now() - last < FAIL_BACKOFF_MS) throw new PipelineError("AI_UNAVAILABLE", "The AI brief is unavailable right now — try again in a few minutes");

  let job = inflight.get(hash);
  if (!job) {
    job = generate(supabase, dept).finally(() => inflight.delete(hash));
    inflight.set(hash, job);
  }
  try {
    const brief = await job;
    failedAt.delete(hash);
    return { ...brief, department_id: dept, cached: false };
  } catch (e) {
    if (e instanceof AIUnavailableError || (e instanceof Error && e.name.includes("NoObjectGenerated"))) {
      failedAt.set(hash, Date.now());
      throw new PipelineError("AI_UNAVAILABLE", "The AI brief is unavailable right now — try again in a few minutes");
    }
    throw e;
  }
}
