import type { Metadata } from "next";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { AlarmClock, AlertTriangle, Building2, CalendarDays, CheckCircle2, ClipboardList, Clock, Hourglass, UserPlus } from "lucide-react";
import { AreaTrend, Card, EmptyState, ErrorState, LangText, PriorityChip, StatusChip } from "@/components/ui";
import { AdminBriefCard } from "@/components/brief/brief-card";
import { AttentionCard, IssueRow, LegendDot, MiniMap, OpsKpi, RecentRow, type OpsLocation, type OpsTicket } from "@/components/admin/ops";
import { SlaCountdown } from "@/components/ticket/sla-countdown";
import { getAdminStats } from "@/lib/admin";
import { requireRole } from "@/lib/auth";
import { ADMIN_STATS_DAYS, CATEGORIES, type AdminStats } from "@/lib/domain";
import { PipelineError } from "@/lib/complaints";
import { createClient } from "@/lib/supabase/server";
import { cn, toLocaleDigits } from "@/lib/utils";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("nav.admin");
  return { title: `${t("dashboard")} — ${t("title")}` };
}

type Dept = { id: string; name_en: string; name_as: string };

function Bars({ rows, n }: { rows: { key: string; label: string; value: number }[]; n: (v: number | string) => string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <ul className="space-y-3">
      {rows.map((r) => (
        <li key={r.key}>
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="min-w-0 truncate text-muted-foreground">{r.label}</span>
            <span className="tabular font-semibold">{n(r.value)}</span>
          </div>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-muted" aria-hidden>
            <div className="h-full rounded-full bg-foreground/80" style={{ width: `${(r.value / max) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

// S13 — Admin dashboard, scoped to the admin's department (super admin: all departments or ?department=).
export default async function AdminHome({ searchParams }: { searchParams: Promise<{ days?: string; department?: string; tab?: string }> }) {
  const { user, profile } = await requireRole("dept_admin", "super_admin");
  const sp = await searchParams;
  const days = (ADMIN_STATS_DAYS as readonly number[]).includes(Number(sp.days)) ? Number(sp.days) : 14;
  const tab: RecentTab = (RECENT_TABS as readonly string[]).includes(sp.tab ?? "") ? (sp.tab as RecentTab) : "all";
  const isSuper = profile.role === "super_admin";
  const requested = isSuper && sp.department && /^[0-9a-f-]{36}$/i.test(sp.department) ? sp.department : null;

  const [t, tc, locale, supabase] = await Promise.all([
    getTranslations("admin"),
    getTranslations("category"),
    getLocale(),
    createClient(),
  ]);
  const n = (v: number | string) => toLocaleDigits(v, locale);

  const { data: deptRows } = await supabase.from("departments").select("id, name_en, name_as").order("name_en");
  const departments = (deptRows ?? []) as Dept[];
  const scopeId = isSuper ? requested : profile.department_id;
  const scope = departments.find((d) => d.id === scopeId) ?? null;

  let data: AdminStats | null = null;
  let failure: "noDept" | "error" | null = null;
  try {
    data = await getAdminStats(supabase, { id: user.id, profile }, days, requested);
  } catch (e) {
    failure = e instanceof PipelineError && e.code === "FORBIDDEN" ? "noDept" : "error";
  }
  const ops = data ? await loadOps(supabase, scopeId ?? null, days, tab).catch(() => null) : null;

  const qs = (patch: Record<string, string | null>) => {
    const p = new URLSearchParams();
    const merged = { days: String(days), department: requested, tab: tab === "all" ? null : tab, ...patch };
    for (const [k, v] of Object.entries(merged)) if (v && !(k === "days" && v === "14")) p.set(k, v);
    const s = p.toString();
    return s ? `/admin?${s}` : "/admin";
  };

  return (
    <div className="mx-auto max-w-[84rem]">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-display text-[2.25rem] sm:text-[2.75rem]">{t("ops.title")}</h1>
          <p className="mt-2 text-muted-foreground">
            {t("ops.subtitle")} <span aria-hidden>·</span>{" "}
            {scope ? <LangText en={scope.name_en} as={scope.name_as} /> : t("allDepartments")}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex h-10 items-center gap-2 rounded-full border border-border bg-surface px-4 text-sm font-medium shadow-sm">
            <CalendarDays className="size-4 text-muted-foreground" strokeWidth={1.75} aria-hidden />
            <span className="tabular">{new Intl.DateTimeFormat(locale === "as" ? "as-IN" : "en-IN", { weekday: "long", day: "numeric", month: "long", timeZone: "Asia/Kolkata" }).format(new Date())}</span>
          </span>
          <nav aria-label={t("rangeLabel")} className="inline-flex rounded-full bg-surface-sunken/70 p-1 shadow-[inset_0_1px_2px_rgb(0_0_0/0.04)]">
            {ADMIN_STATS_DAYS.map((d) => (
              <Link
                key={d}
                href={qs({ days: String(d) })}
                scroll={false}
                aria-current={d === days ? "page" : undefined}
                className={cn(
                  "inline-flex h-10 items-center rounded-full px-4 text-sm font-medium transition-[background-color,color,box-shadow] duration-200",
                  d === days ? "bg-surface text-foreground shadow-sm ring-1 ring-border" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {t("days", { n: n(d) })}
              </Link>
            ))}
          </nav>
        </div>
      </header>

      {isSuper && departments.length > 0 && (
        <nav aria-label={t("departmentFilter")} className="mt-5 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]">
          {[{ id: null as string | null, name_en: "", name_as: "" }, ...departments].map((d) => {
            const on = (d.id ?? null) === requested;
            return (
              <Link
                key={d.id ?? "all"}
                href={qs({ department: d.id })}
                scroll={false}
                aria-current={on ? "page" : undefined}
                className={cn(
                  "shrink-0 rounded-full border px-3.5 py-1.5 text-sm whitespace-nowrap transition-colors",
                  on ? "border-foreground bg-primary text-primary-foreground" : "border-border bg-surface text-muted-foreground hover:text-foreground",
                )}
              >
                {d.id ? <LangText en={d.name_en} as={d.name_as} /> : t("allDepartments")}
              </Link>
            );
          })}
        </nav>
      )}

      {failure === "noDept" ? (
        <EmptyState className="mt-8" icon={Building2} title={t("noDeptTitle")} body={t("noDeptBody")} />
      ) : failure || !data ? (
        <ErrorState className="mt-8" title={t("loadError")} />
      ) : (
        <Dashboard data={data} ops={ops} t={t} tc={tc} n={n} locale={locale} tab={tab} qs={qs} isSuper={isSuper && !requested} department={scopeId ?? null} />
      )}
    </div>
  );
}

type T = Awaited<ReturnType<typeof getTranslations>>;
type TC = T;

function Dashboard({
  data, ops, t, tc, n, locale, tab, qs, isSuper, department,
}: {
  data: AdminStats; ops: Ops | null; t: T; tc: TC; n: (v: number | string) => string; locale: string;
  tab: RecentTab; qs: (patch: Record<string, string | null>) => string; isSuper: boolean; department: string | null;
}) {
  const s = data.stats;
  const created = data.trend.map((r) => r.created);
  const fixed = data.trend.map((r) => r.resolved);
  const hasTrend = created.some((v) => v > 0) || fixed.some((v) => v > 0);
  const known = new Set<string>(CATEGORIES);
  const categories = data.categories
    .filter((c) => known.has(c.category))
    .slice(0, 8)
    .map((c) => ({ key: c.category, label: tc(c.category), value: c.total }));

  return (
    <div className="mt-8 space-y-6">
      {ops && <OpsTop ops={ops} data={data} t={t} tc={tc} n={n} locale={locale} tab={tab} qs={qs} />}

      <h2 className="text-title pt-2 text-xl">{t("ops.insightsTitle")}</h2>
      <section className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <h2 className="text-title text-lg">{t("trendTitle")}</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">{t("trendRange", { n: n(data.days) })}</p>
          {hasTrend ? (
            <>
              <AreaTrend
                series={created}
                compare={fixed}
                height={160}
                label={`${t("legendReported")}: ${created.join(", ")}. ${t("legendFixed")}: ${fixed.join(", ")}.`}
                className="mt-6"
              />
              <div className="mt-4 flex gap-5 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-2"><span className="h-[2px] w-4 rounded-full bg-foreground" aria-hidden />{t("legendReported")}</span>
                <span className="inline-flex items-center gap-2"><span className="w-4 border-t-[1.5px] border-dashed border-subtle-foreground" aria-hidden />{t("legendFixed")}</span>
              </div>
            </>
          ) : (
            <div className="mt-6 grid h-[160px] place-items-center rounded-2xl bg-surface-muted text-sm text-muted-foreground">{t("noData")}</div>
          )}
        </Card>

        <div className="space-y-6">
          <Card>
            <h2 className="text-title text-lg">{t("languageTitle")}</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">{t("languageBody")}</p>
            <div className="mt-6">
              <Bars
                n={n}
                rows={[
                  { key: "as", label: t("langAs"), value: s.by_lang.as },
                  { key: "en", label: t("langEn"), value: s.by_lang.en },
                ]}
              />
            </div>
          </Card>
          <Card>
            <h2 className="text-title text-lg">{t("categoryTitle")}</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">{t("trendRange", { n: n(data.days) })}</p>
            <div className="mt-6">{categories.length ? <Bars rows={categories} n={n} /> : <p className="text-sm text-muted-foreground">{t("noData")}</p>}</div>
          </Card>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-3">
        <AdminBriefCard department={department} />

        <Card className="lg:col-span-2">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-title text-lg">{t("overdueTitle")}</h2>
              <p className="mt-0.5 text-sm text-muted-foreground">{t("overdueBody")}</p>
            </div>
            <Link href="/admin/queue" className="shrink-0 text-sm font-medium text-muted-foreground hover:text-foreground">
              {t("openQueue")}
            </Link>
          </div>
          {data.overdue.length === 0 ? (
            <EmptyState bare className="py-8" icon={CheckCircle2} title={t("noOverdueTitle")} body={t("noOverdueBody")} />
          ) : (
            <ul className="mt-4 divide-y divide-border">
              {data.overdue.map((o) => (
                <li key={o.id}>
                  <Link href={`/admin/t/${o.id}`} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 py-3 hover:bg-surface-muted/50 sm:flex-nowrap">
                    <AlarmClock className="size-4 shrink-0 text-danger" strokeWidth={1.75} aria-hidden />
                    <span className="font-mono text-xs font-semibold tracking-wider text-muted-foreground">{o.code}</span>
                    <LangText en={o.title_en} as={o.title_as} fallback={o.code} className="min-w-0 flex-1 truncate text-sm font-medium" />
                    <PriorityChip priority={o.priority} />
                    <StatusChip status={o.status} />
                    <SlaCountdown due={o.sla_due_at} status={o.status} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </section>

      {isSuper && data.load.length > 0 && (
        <Card className="p-0 sm:p-0">
          <div className="px-5 pt-5 sm:px-6 sm:pt-6">
            <h2 className="text-title text-lg">{t("loadTitle")}</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">{t("loadBody")}</p>
          </div>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-y border-border text-left text-xs text-muted-foreground">
                  <th scope="col" className="px-5 py-2.5 font-medium sm:px-6">{t("loadDept")}</th>
                  <th scope="col" className="px-5 py-2.5 text-right font-medium">{t("loadOpen")}</th>
                  <th scope="col" className="px-5 py-2.5 text-right font-medium sm:px-6">{t("loadOverdue")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {data.load.map((d) => (
                  <tr key={d.department_id}>
                    <td className="px-5 py-3 sm:px-6">
                      <Link href={`/admin?department=${d.department_id}`} className="font-medium hover:underline">
                        <LangText en={d.name_en} as={d.name_as} />
                      </Link>
                    </td>
                    <td className="tabular px-5 py-3 text-right">{n(d.open_count)}</td>
                    <td className={cn("tabular px-5 py-3 text-right sm:px-6", d.overdue > 0 && "font-semibold text-danger")}>{n(d.overdue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

// ---------- Operations center data ----------

const OPEN: string[] = ["submitted", "triaged", "needs_review", "assigned", "in_progress"];
const RECENT_TABS = ["all", "open", "working", "fixed"] as const;
type RecentTab = (typeof RECENT_TABS)[number];
const TAB_STATUSES: Record<RecentTab, string[] | null> = {
  all: null,
  open: ["submitted", "triaged", "needs_review", "assigned"],
  working: ["in_progress"],
  fixed: ["resolved", "closed"],
};
const COLS = "id, code, title_en, title_as, category, priority, status, assignee_id, sla_due_at, created_at, location_id";
const NEAR_MS = 6 * 3600_000;

type Supa = Awaited<ReturnType<typeof createClient>>;
type Ops = Awaited<ReturnType<typeof loadOps>>;

/** Everything the top of the Operations center needs. RLS scopes dept admins; super admins may pass a department. */
async function loadOps(supabase: Supa, dept: string | null, days: number, tab: RecentTab) {
  const base = () => {
    const q = supabase.from("complaints").select(COLS).is("parent_id", null);
    return dept ? q.eq("department_id", dept) : q;
  };
  const head = (statuses: string[] | null) => {
    let q = supabase.from("complaints").select("id", { count: "exact", head: true }).is("parent_id", null);
    if (dept) q = q.eq("department_id", dept);
    return statuses ? q.in("status", statuses) : q;
  };
  const tabStatuses = TAB_STATUSES[tab];
  const recentQ = tabStatuses ? base().in("status", tabStatuses) : base();

  const [openRes, recentRes, locRes, trendRes, cAll, cOpen, cWorking, cFixed] = await Promise.all([
    base().in("status", OPEN).limit(1000),
    recentQ.order("created_at", { ascending: false }).limit(8),
    supabase.from("locations").select("id, name_en, name_as, map_x, map_y"),
    supabase.rpc("trend_by_day", { dept, days: days * 2 }),
    head(null), head(TAB_STATUSES.open), head(TAB_STATUSES.working), head(TAB_STATUSES.fixed),
  ]);
  if (openRes.error || recentRes.error) throw new Error("ops load failed");

  const open = (openRes.data ?? []) as unknown as OpsTicket[];
  const now = Date.now();
  const due = (x: OpsTicket) => (x.sla_due_at ? new Date(x.sla_due_at).getTime() : Number.POSITIVE_INFINITY);
  const overdue = open.filter((x) => due(x) < now);
  const nearing = open.filter((x) => due(x) >= now && due(x) - now <= NEAR_MS);
  const highUnassigned = open.filter((x) => x.priority <= 2 && !x.assignee_id);
  const high = open.filter((x) => x.priority <= 2).sort((a, b) => due(a) - due(b) || a.priority - b.priority);

  // Change vs the previous period of the same length (only numbers the trend can answer honestly).
  const series = ((trendRes.data ?? []) as { created: number; resolved: number }[]).map((r) => ({ c: Number(r.created) || 0, r: Number(r.resolved) || 0 }));
  const prev = series.slice(0, Math.max(0, series.length - days));
  const cur = series.slice(-days);
  const sum = (a: typeof series, k: "c" | "r") => a.reduce((x, y) => x + y[k], 0);
  const pct = (a: number, b: number) => (b === 0 ? (a === 0 ? 0 : null) : Math.round(((a - b) / b) * 100));

  return {
    open, overdue, nearing, highUnassigned, high,
    recent: (recentRes.data ?? []) as unknown as OpsTicket[],
    locations: (locRes.data ?? []) as OpsLocation[],
    counts: { all: cAll.count ?? 0, open: cOpen.count ?? 0, working: cWorking.count ?? 0, fixed: cFixed.count ?? 0 },
    reportedDelta: pct(sum(cur, "c"), sum(prev, "c")),
    fixedDelta: pct(sum(cur, "r"), sum(prev, "r")),
    fixedInPeriod: sum(cur, "r"),
  };
}

function OpsTop({
  ops, data, t, tc, n, locale, tab, qs,
}: {
  ops: Ops; data: AdminStats; t: T; tc: TC; n: (v: number | string) => string; locale: string; tab: RecentTab; qs: (patch: Record<string, string | null>) => string;
}) {
  const s = data.stats;
  const needs = (ops.overdue.length ? 1 : 0) + (ops.highUnassigned.length ? 1 : 0) + (ops.nearing.length ? 1 : 0);
  const locById = new Map(ops.locations.map((l) => [l.id, l]));
  const reportedFmt = new Intl.DateTimeFormat(locale === "as" ? "as-IN" : "en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });
  const working = ops.open.filter((x) => x.status === "in_progress").length;
  const unassigned = ops.open.filter((x) => !x.assignee_id).length;
  const tabLabel: Record<RecentTab, string> = { all: t("ops.tabAll"), open: t("ops.tabOpen"), working: t("ops.tabWorking"), fixed: t("ops.tabFixed") };

  return (
    <>
      {/* Needs attention */}
      <section aria-labelledby="ops-attention" className="rounded-[1.75rem] border border-border bg-surface-muted/70 p-4 sm:p-5">
        <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1 px-1">
          <AlertTriangle className={cn("size-5", needs ? "text-warning" : "text-muted-foreground")} strokeWidth={1.75} aria-hidden />
          <h2 id="ops-attention" className="text-title text-lg">{t("ops.attention")}</h2>
          {needs > 0 && <span className="rounded-full bg-warning-soft px-2.5 py-0.5 text-[11px] font-semibold text-warning">{t("ops.actionRequired")}</span>}
          <p className="w-full text-sm text-muted-foreground sm:w-auto">{needs ? t("ops.attentionCount", { n: n(needs) }) : t("ops.attentionNone")}</p>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          <AttentionCard
            icon={AlarmClock}
            tone="danger"
            quiet={ops.overdue.length === 0}
            title={t("ops.overdueTitle", { n: n(ops.overdue.length) })}
            body={ops.overdue.length ? t("ops.overdueBody") : t("ops.overdueOk")}
            action={t("ops.resolveNow")}
            href={ops.overdue[0] ? `/admin/t/${ops.overdue[0].id}` : "/admin/queue"}
          />
          <AttentionCard
            icon={UserPlus}
            tone="warning"
            quiet={ops.highUnassigned.length === 0}
            title={t("ops.unassignedTitle", { n: n(ops.highUnassigned.length) })}
            tag={t("ops.unassignedTag")}
            body={t("ops.unassignedBody")}
            action={t("ops.assignNow")}
            href={ops.highUnassigned[0] ? `/admin/t/${ops.highUnassigned[0].id}` : "/admin/queue"}
          />
          <AttentionCard
            icon={Clock}
            tone="warning"
            quiet={ops.nearing.length === 0}
            title={t("ops.nearingTitle", { n: n(ops.nearing.length) })}
            tag={t("ops.nearingTag")}
            body={t("ops.nearingBody")}
            action={t("ops.reviewNow")}
            href={ops.nearing[0] ? `/admin/t/${ops.nearing[0].id}` : "/admin/queue"}
          />
        </div>
      </section>

      {/* KPIs */}
      <section aria-label={t("kpiLabel")} className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-5">
        <OpsKpi icon={ClipboardList} label={t("ops.kpiOpen")} value={n(s.open)} delta={ops.reportedDelta} deltaLabel={t("ops.vsPrev", { n: n(data.days) })} />
        <OpsKpi icon={AlarmClock} label={t("ops.kpiOverdue")} value={n(s.overdue)} tone={s.overdue > 0 ? "danger" : undefined} />
        <OpsKpi icon={UserPlus} label={t("ops.kpiUnassigned")} value={n(unassigned)} />
        <OpsKpi icon={CheckCircle2} label={t("ops.kpiFixed")} value={n(ops.fixedInPeriod)} delta={ops.fixedDelta} deltaLabel={t("ops.vsPrev", { n: n(data.days) })} goodWhenUp />
        <OpsKpi icon={Hourglass} label={t("ops.kpiAvg")} value={s.avg_resolution_hours != null ? t("hours", { n: n(s.avg_resolution_hours) }) : "—"} />
      </section>

      {/* High-priority issues + live map */}
      <section className="grid gap-6 lg:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)]">
        <Card className="p-0 sm:p-0">
          <div className="flex items-center justify-between gap-3 px-5 pt-5 sm:px-6">
            <div className="flex items-center gap-2.5">
              <h2 className="text-title text-lg">{t("ops.highTitle")}</h2>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-p1/30 px-2 py-0.5 text-[11px] font-semibold">
                <span className="size-1.5 rounded-full bg-p1" aria-hidden />
                {t("ops.highTag")}
              </span>
            </div>
            <Link href="/admin/queue?priority=1" className="text-sm font-medium text-muted-foreground hover:text-foreground">{t("ops.viewAll")}</Link>
          </div>
          {ops.high.length === 0 ? (
            <EmptyState bare className="py-10" icon={CheckCircle2} title={t("ops.noHigh")} />
          ) : (
            <>
              <ul className="mt-3 divide-y divide-border border-t border-border">
                {ops.high.slice(0, 5).map((x) => (
                  <IssueRow key={x.id} t={x} assignLabel={t("ops.assign")} openLabel={t("ops.open")} />
                ))}
              </ul>
              <p className="border-t border-border px-5 py-3.5 text-sm text-muted-foreground sm:px-6">
                {t("ops.showing", { shown: n(Math.min(5, ops.high.length)), total: n(ops.high.length) })}
              </p>
            </>
          )}
        </Card>

        <Card className="flex flex-col">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-title text-lg">{t("ops.mapTitle")}</h2>
              <p className="text-xs text-muted-foreground">{t("ops.mapSchematic")}</p>
            </div>
            <Link href="/admin/map" className="text-sm font-medium text-muted-foreground hover:text-foreground">{t("ops.viewMap")}</Link>
          </div>
          <MiniMap locations={ops.locations} open={ops.open} locale={locale} label={t("ops.mapTitle")} />
          <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2">
            <LegendDot className="bg-p1" label={t("ops.legendOpen")} value={n(ops.open.length - working)} />
            <LegendDot className="bg-foreground" label={t("ops.legendWorking")} value={n(working)} />
            <LegendDot className="border border-foreground bg-transparent" label={t("ops.legendUnassigned")} value={n(unassigned)} />
            <LegendDot className="bg-success" label={t("ops.legendFixed")} value={n(ops.counts.fixed)} />
          </div>
        </Card>
      </section>

      {/* Recent reports */}
      <Card className="p-0 sm:p-0">
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-5 sm:px-6">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-title text-lg">{t("ops.recentTitle")}</h2>
            <nav aria-label={t("ops.recentTitle")} className="flex flex-wrap gap-1.5">
              {RECENT_TABS.map((k) => {
                const on = k === tab;
                return (
                  <Link
                    key={k}
                    href={qs({ tab: k === "all" ? null : k })}
                    scroll={false}
                    aria-current={on ? "page" : undefined}
                    className={cn(
                      "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-sm font-medium transition-colors",
                      on ? "border-foreground bg-primary text-primary-foreground" : "border-border bg-surface text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {tabLabel[k]}
                    <span className={cn("tabular rounded-full px-1.5 text-xs", on ? "bg-primary-foreground/15" : "bg-surface-muted")}>{n(ops.counts[k])}</span>
                  </Link>
                );
              })}
            </nav>
          </div>
          <Link href="/admin/queue?status=all" className="text-sm font-medium text-muted-foreground hover:text-foreground">{t("ops.viewAll")}</Link>
        </div>
        {ops.recent.length === 0 ? (
          <EmptyState bare className="py-10" title={t("ops.noRecent")} />
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-y border-border text-left text-xs text-muted-foreground">
                  <th scope="col" className="py-2.5 pr-4 pl-5 font-medium sm:pl-6">{t("ops.colIssue")}</th>
                  <th scope="col" className="hidden py-2.5 pr-4 font-medium md:table-cell">{t("ops.colLocation")}</th>
                  <th scope="col" className="hidden py-2.5 pr-4 font-medium lg:table-cell">{t("ops.colCategory")}</th>
                  <th scope="col" className="py-2.5 pr-4 font-medium">{t("ops.colStatus")}</th>
                  <th scope="col" className="hidden py-2.5 pr-4 font-medium sm:table-cell">{t("ops.colPriority")}</th>
                  <th scope="col" className="hidden py-2.5 pr-4 font-medium xl:table-cell">{t("ops.colReported")}</th>
                  <th scope="col" className="py-2.5 pr-5 text-right font-medium sm:pr-6"><span className="sr-only">{t("ops.colReported")}</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {ops.recent.map((x) => (
                  <RecentRow
                    key={x.id}
                    t={x}
                    location={x.location_id ? locById.get(x.location_id) : undefined}
                    categoryLabel={tc(x.category)}
                    reported={reportedFmt.format(new Date(x.created_at))}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
