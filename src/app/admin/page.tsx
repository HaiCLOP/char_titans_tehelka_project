import type { Metadata } from "next";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { AlarmClock, Building2, CheckCircle2 } from "lucide-react";
import { AreaTrend, Card, EmptyState, ErrorState, LangText, PriorityChip, StatusChip } from "@/components/ui";
import { AdminBriefCard } from "@/components/brief/brief-card";
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

function Kpi({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: "danger" | "success" }) {
  return (
    <Card className="p-5 sm:p-5">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className={cn("tabular mt-2 text-[2rem] leading-none font-semibold tracking-[-0.02em]", tone === "danger" && "text-danger", tone === "success" && "text-success")}>
        {value}
      </p>
      {hint && <p className="mt-2 text-xs text-muted-foreground">{hint}</p>}
    </Card>
  );
}

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
export default async function AdminHome({ searchParams }: { searchParams: Promise<{ days?: string; department?: string }> }) {
  const { user, profile } = await requireRole("dept_admin", "super_admin");
  const sp = await searchParams;
  const days = (ADMIN_STATS_DAYS as readonly number[]).includes(Number(sp.days)) ? Number(sp.days) : 14;
  const isSuper = profile.role === "super_admin";
  const requested = isSuper && sp.department && /^[0-9a-f-]{36}$/i.test(sp.department) ? sp.department : null;

  const [t, tc, tn, locale, supabase] = await Promise.all([
    getTranslations("admin"),
    getTranslations("category"),
    getTranslations("nav.admin"),
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

  const qs = (patch: Record<string, string | null>) => {
    const p = new URLSearchParams();
    const merged = { days: String(days), department: requested, ...patch };
    for (const [k, v] of Object.entries(merged)) if (v && !(k === "days" && v === "14")) p.set(k, v);
    const s = p.toString();
    return s ? `/admin?${s}` : "/admin";
  };

  return (
    <div className="mx-auto max-w-[84rem]">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-display text-[2.25rem] sm:text-[2.75rem]">{tn("dashboard")}</h1>
          <p className="mt-2 text-muted-foreground">
            {scope ? <LangText en={scope.name_en} as={scope.name_as} /> : t("allDepartments")}
          </p>
        </div>
        <nav aria-label={t("rangeLabel")} className="inline-flex rounded-full bg-surface-sunken/70 p-1 shadow-[inset_0_1px_2px_rgb(0_0_0/0.04)]">
          {ADMIN_STATS_DAYS.map((d) => (
            <Link
              key={d}
              href={qs({ days: String(d) })}
              scroll={false}
              aria-current={d === days ? "page" : undefined}
              className={cn(
                "rounded-full px-4 py-2 text-sm font-medium transition-[background-color,color,box-shadow] duration-200",
                d === days ? "bg-surface text-foreground shadow-sm ring-1 ring-border" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t("days", { n: n(d) })}
            </Link>
          ))}
        </nav>
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
        <Dashboard data={data} t={t} tc={tc} n={n} isSuper={isSuper && !requested} department={scopeId ?? null} />
      )}
    </div>
  );
}

type T = Awaited<ReturnType<typeof getTranslations>>;
type TC = T;

function Dashboard({ data, t, tc, n, isSuper, department }: { data: AdminStats; t: T; tc: TC; n: (v: number | string) => string; isSuper: boolean; department: string | null }) {
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
      <section aria-label={t("kpiLabel")} className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <Kpi label={t("kpi.open")} value={n(s.open)} hint={s.needs_review ? t("kpi.needsReview", { n: n(s.needs_review) }) : undefined} />
        <Kpi label={t("kpi.overdue")} value={n(s.overdue)} tone={s.overdue > 0 ? "danger" : undefined} />
        <Kpi label={t("kpi.fixedWeek")} value={n(s.fixed_week)} tone={s.fixed_week > 0 ? "success" : undefined} />
        <Kpi label={t("kpi.avgResolution")} value={s.avg_resolution_hours != null ? t("hours", { n: n(s.avg_resolution_hours) }) : "—"} />
        <Kpi
          label={t("kpi.satisfaction")}
          value={s.rating_avg != null ? `${n(s.rating_avg.toFixed(1))} / ${n(5)}` : "—"}
          hint={s.rating_count ? t("kpi.ratings", { count: s.rating_count, n: n(s.rating_count) }) : t("kpi.noRatings")}
        />
      </section>

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
