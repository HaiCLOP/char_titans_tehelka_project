import type { Metadata } from "next";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { CheckCircle2 } from "lucide-react";
import { CategoryBars, PulseKpi } from "@/components/pulse/pulse-parts";
import { AreaTrend, Card, EmptyState, ErrorState, IssueCard, buttonVariants } from "@/components/ui";
import { CATEGORIES, DONE_STATUSES, type Category, type Status } from "@/lib/domain";
import { createClient } from "@/lib/supabase/server";
import { toLocaleDigits } from "@/lib/utils";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("pulse");
  return { title: t("title") };
}

const TREND_DAYS = 14;
const CATEGORY_DAYS = 30;
const FEED_LIMIT = 8;

type Stats = { open: number; in_progress: number; avg_resolution_hours: number | null };
type TrendRow = { day: string; created: number; resolved: number };
type CatRow = { category: string; total: number };
type Fixed = {
  id: string;
  code: string;
  title_en: string | null;
  title_as: string | null;
  category: Category;
  priority: number;
  status: Status;
  location_id: string | null;
  metoo_count: number;
  created_at: string;
  resolved_at: string | null;
};

/**
 * Signed-out safe: aggregate RPCs that anon may execute (dashboard_stats, trend_by_day, category_breakdown)
 * and the `complaints_public` view. No reporter names, no photos.
 */
async function loadPulse() {
  const supabase = await createClient();
  const [stats, trend, cats, fixed, locs] = await Promise.all([
    supabase.rpc("dashboard_stats"),
    supabase.rpc("trend_by_day", { days: TREND_DAYS }),
    supabase.rpc("category_breakdown", { days: CATEGORY_DAYS }),
    supabase
      .from("complaints_public")
      .select("id, code, title_en, title_as, category, priority, status, location_id, metoo_count, created_at, resolved_at")
      .in("status", [...DONE_STATUSES])
      .not("resolved_at", "is", null)
      .order("resolved_at", { ascending: false })
      .limit(FEED_LIMIT),
    supabase.from("locations").select("id, name_en, name_as"),
  ]);
  for (const [what, r] of Object.entries({ stats, trend, cats, fixed, locs })) {
    if (r.error) console.error(`[pulse] ${what} failed`, r.error.code, r.error.message);
  }
  return {
    stats: stats.error ? null : ((stats.data as Stats | null) ?? null),
    trend: trend.error ? null : ((trend.data ?? []) as TrendRow[]),
    cats: cats.error ? null : ((cats.data ?? []) as CatRow[]),
    fixed: fixed.error ? null : ((fixed.data ?? []) as Fixed[]),
    locs: new Map(((locs.data ?? []) as { id: string; name_en: string; name_as: string }[]).map((l) => [l.id, l])),
  };
}

// S02 — Campus Pulse: how the campus is doing, for everyone (signed out too).
export default async function PulsePage() {
  const [t, tc, locale, data] = await Promise.all([getTranslations("pulse"), getTranslations("category"), getLocale(), loadPulse()]);
  const n = (v: number | string) => toLocaleDigits(v, locale);

  const s = data.stats;
  const trend = data.trend ?? [];
  const created = trend.map((r) => Number(r.created));
  const fixed = trend.map((r) => Number(r.resolved));
  const fixedWeek = fixed.slice(-7).reduce((a, b) => a + b, 0);
  const hasTrend = created.some((v) => v > 0) || fixed.some((v) => v > 0);
  const known = new Set<string>(CATEGORIES);
  const catRows = (data.cats ?? [])
    .filter((c) => known.has(c.category) && Number(c.total) > 0)
    .map((c) => ({ key: c.category, label: tc(c.category), value: Number(c.total), display: n(Number(c.total)) }));

  const hours = (i: Fixed) => (i.resolved_at ? Math.max(1, Math.round((new Date(i.resolved_at).getTime() - new Date(i.created_at).getTime()) / 36e5)) : null);

  return (
    <div>
      <header className="max-w-2xl">
        <h1 className="text-display text-[2.25rem] sm:text-[3rem]">{t("title")}</h1>
        <p className="mt-3 text-[1.0625rem] leading-relaxed text-muted-foreground">{t("subtitle")}</p>
      </header>

      <section aria-label={t("kpiLabel")} className="mt-8 grid gap-4 sm:grid-cols-3">
        {s === null || data.trend === null ? (
          <ErrorState className="sm:col-span-3" title={t("errorTitle")} body={t("errorBody")} />
        ) : (
          <>
            <PulseKpi label={t("kpiFixedWeek")} value={n(fixedWeek)} hint={t("kpiFixedWeekHint")} tone={fixedWeek > 0 ? "success" : undefined} />
            <PulseKpi
              label={t("kpiAvg")}
              value={s.avg_resolution_hours != null ? t("hours", { n: n(s.avg_resolution_hours) }) : "—"}
              hint={s.avg_resolution_hours != null ? t("kpiAvgHint") : t("kpiAvgNone")}
            />
            <PulseKpi label={t("kpiOpen")} value={n(Number(s.open ?? 0) + Number(s.in_progress ?? 0))} hint={t("kpiOpenHint", { n: n(Number(s.in_progress ?? 0)) })} />
          </>
        )}
      </section>

      <section className="mt-6 grid gap-6 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <h2 className="text-title text-lg">{t("trendTitle")}</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">{t("trendRange", { n: n(TREND_DAYS) })}</p>
          {data.trend === null ? (
            <ErrorState bare className="py-8" title={t("errorTitle")} body={t("errorBody")} />
          ) : hasTrend ? (
            <>
              <AreaTrend
                series={created}
                compare={fixed}
                height={170}
                label={`${t("legendReported")}: ${created.join(", ")}. ${t("legendFixed")}: ${fixed.join(", ")}.`}
                className="mt-6"
              />
              <div className="mt-4 flex gap-5 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-2"><span className="h-[2px] w-4 rounded-full bg-foreground" aria-hidden />{t("legendReported")}</span>
                <span className="inline-flex items-center gap-2"><span className="w-4 border-t-[1.5px] border-dashed border-subtle-foreground" aria-hidden />{t("legendFixed")}</span>
              </div>
            </>
          ) : (
            <div className="mt-6 grid h-[170px] place-items-center rounded-2xl bg-surface-muted px-4 text-center text-sm text-muted-foreground">{t("noData")}</div>
          )}
        </Card>

        <Card className="lg:col-span-2">
          <h2 className="text-title text-lg">{t("categoryTitle")}</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">{t("trendRange", { n: n(CATEGORY_DAYS) })}</p>
          <div className="mt-6">
            {data.cats === null ? (
              <ErrorState bare className="py-8" title={t("errorTitle")} body={t("errorBody")} />
            ) : catRows.length ? (
              <CategoryBars rows={catRows} />
            ) : (
              <p className="rounded-2xl bg-surface-muted px-4 py-10 text-center text-sm text-muted-foreground">{t("noData")}</p>
            )}
          </div>
        </Card>
      </section>

      <section className="mt-10" aria-labelledby="pulse-fixed">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="pulse-fixed" className="text-title text-xl">{t("fixedTitle")}</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">{t("fixedBody")}</p>
          </div>
          <Link href="/?view=resolved" className="text-sm font-medium text-muted-foreground hover:text-foreground">{t("seeAll")}</Link>
        </div>
        {data.fixed === null ? (
          <ErrorState className="mt-5" title={t("errorTitle")} body={t("errorBody")} />
        ) : data.fixed.length === 0 ? (
          <EmptyState
            className="mt-5"
            icon={CheckCircle2}
            title={t("fixedEmptyTitle")}
            body={t("fixedEmptyBody")}
            action={<Link href="/report" className={buttonVariants({ variant: "primary" })}>{t("reportCta")}</Link>}
          />
        ) : (
          <ul className="mt-5 grid gap-3 sm:grid-cols-2">
            {data.fixed.map((i) => {
              const loc = i.location_id ? data.locs.get(i.location_id) : undefined;
              const h = hours(i);
              return (
                <li key={i.id}>
                  <IssueCard
                    compact
                    issue={{ ...i, photo_url: null, location: loc ? { name_en: loc.name_en, name_as: loc.name_as } : null }}
                    footer={h !== null ? <p className="text-xs font-medium text-success">{t("fixedIn", { n: n(h), count: h })}</p> : undefined}
                  />
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
