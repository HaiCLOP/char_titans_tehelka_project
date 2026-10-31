import type { Metadata } from "next";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { Activity, ArrowRight, CheckCircle2, Inbox } from "lucide-react";
import { AreaTrend, CATEGORY_ICON, Card, EmptyState, IssueCard, LifecycleTrack, buttonVariants } from "@/components/ui";
import { getProfile, getUser } from "@/lib/auth";
import { ComplaintListQuerySchema, DONE_STATUSES, type Category, type ComplaintListItem } from "@/lib/domain";
import { createClient } from "@/lib/supabase/server";
import { listComplaints } from "@/lib/tracking";
import { toLocaleDigits } from "@/lib/utils";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("pulse");
  return { title: `${t("title")} — CivicSense` };
}

type Stats = { open: number; in_progress: number; resolved: number; overdue: number; avg_resolution_hours: number | null };
type TrendRow = { day: string; created: number; resolved: number };

const FIXED_DAYS = 7;
const BREAKDOWN_DAYS = 30;

async function loadPulseData() {
  const supabase = await createClient();
  const [user, profile] = await Promise.all([getUser(), getProfile()]);
  const viewer = user && profile ? { id: user.id, profile } : null;

  const since7d = new Date(Date.now() - FIXED_DAYS * 864e5).toISOString();
  const since30d = new Date(Date.now() - BREAKDOWN_DAYS * 864e5).toISOString();

  const query = ComplaintListQuerySchema.parse({ scope: "public", status: "resolved" });

  const [statsRes, trendRes, fixed7dRes, cat30dRes, resolvedRes] = await Promise.allSettled([
    supabase.rpc("dashboard_stats"),
    supabase.rpc("trend_by_day", { days: 14 }),
    supabase
      .from("complaints_public")
      .select("id", { count: "exact", head: true })
      .in("status", [...DONE_STATUSES])
      .gte("resolved_at", since7d),
    supabase
      .from("complaints_public")
      .select("category")
      .gte("created_at", since30d),
    listComplaints(supabase, viewer, query),
  ]);

  const stats = statsRes.status === "fulfilled" ? ((statsRes.value.data as Stats | null) ?? null) : null;
  const trend = trendRes.status === "fulfilled" ? ((trendRes.value.data as TrendRow[] | null) ?? []) : [];
  const fixedThisWeekCount = fixed7dRes.status === "fulfilled" ? (fixed7dRes.value.count ?? (stats?.resolved ?? 0)) : (stats?.resolved ?? 0);

  const categoriesRows = cat30dRes.status === "fulfilled" ? (cat30dRes.value.data ?? []) : [];
  const categoryCounts: Record<string, number> = {};
  for (const r of categoriesRows) {
    if (r.category) {
      categoryCounts[r.category] = (categoryCounts[r.category] ?? 0) + 1;
    }
  }

  const resolvedIssues = resolvedRes.status === "fulfilled" ? resolvedRes.value.items.slice(0, 4) : [];

  return {
    stats,
    trend,
    fixedThisWeekCount,
    categoryCounts,
    resolvedIssues,
  };
}

export default async function PulsePage() {
  const [t, tc, locale, data] = await Promise.all([
    getTranslations("pulse"),
    getTranslations("category"),
    getLocale(),
    loadPulseData(),
  ]);

  const s = data.stats;
  const createdSeries = data.trend.map((r) => Number(r.created));
  const fixedSeries = data.trend.map((r) => Number(r.resolved));

  const sortedCategories = Object.entries(data.categoryCounts).sort((a, b) => b[1] - a[1]);
  const totalCategoryReports = sortedCategories.reduce((sum, [, count]) => sum + count, 0);

  return (
    <div className="space-y-6 sm:space-y-8">
      {/* Header */}
      <header className="space-y-2 max-w-3xl">
        <div className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1 text-xs font-semibold text-primary shadow-xs">
          <Activity className="size-3.5 text-primary animate-pulse" aria-hidden />
          <span>{t("eyebrow")} · Dibrugarh University</span>
        </div>
        <h1 className="text-2xl sm:text-4xl font-bold tracking-tight text-foreground">{t("title")}</h1>
        <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">{t("subtitle")}</p>
      </header>

      {/* 3 Main KPI Metrics */}
      <section className="grid gap-3.5 sm:grid-cols-3">
        {/* Fixed This Week */}
        <Card className="p-4 sm:p-5 border-success/30 bg-gradient-to-br from-surface to-success/5 shadow-xs">
          <span className="text-xs font-semibold text-muted-foreground">{t("fixedWeek")}</span>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl sm:text-4xl font-extrabold text-success tabular-nums">
              {toLocaleDigits(data.fixedThisWeekCount, locale)}
            </span>
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">{t("fixedWeekDesc")}</p>
        </Card>

        {/* Average Time To Fix */}
        <Card className="p-4 sm:p-5 border-primary/30 bg-gradient-to-br from-surface to-primary/5 shadow-xs">
          <span className="text-xs font-semibold text-muted-foreground">{t("avgTime")}</span>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl sm:text-4xl font-extrabold text-primary tabular-nums">
              {s?.avg_resolution_hours != null ? `${toLocaleDigits(Number(s.avg_resolution_hours.toFixed(1)), locale)} h` : "0 h"}
            </span>
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">{t("avgTimeDesc")}</p>
        </Card>

        {/* Open Now */}
        <Card className="p-4 sm:p-5 border-warning/30 bg-gradient-to-br from-surface to-warning/5 shadow-xs">
          <span className="text-xs font-semibold text-muted-foreground">{t("openNow")}</span>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl sm:text-4xl font-extrabold text-warning tabular-nums">
              {toLocaleDigits(s?.open ?? 0, locale)}
            </span>
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">
            {t("openNowDesc", { count: s?.in_progress ?? 0, n: toLocaleDigits(s?.in_progress ?? 0, locale) })}
          </p>
        </Card>
      </section>

      {/* 2-Column Grid: Trend & Category Breakdown */}
      <div className="grid gap-6 lg:grid-cols-12 items-start">
        {/* Left Column (7 cols): 14-Day Velocity Trend & 30-Day Breakdown */}
        <div className="lg:col-span-7 space-y-6">
          {/* Reported and Fixed Trend (Last 14 Days) */}
          <Card className="p-5 shadow-xs">
            <div className="flex items-center justify-between gap-3 mb-4">
              <div>
                <h2 className="text-base font-bold tracking-tight text-foreground">{t("trendTitle")}</h2>
                <p className="text-xs text-muted-foreground">{t("trendSubtitle")}</p>
              </div>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">
                <span className="size-1.5 rounded-full bg-primary animate-pulse" aria-hidden />
                <span>Live</span>
              </span>
            </div>

            <AreaTrend
              series={createdSeries}
              compare={fixedSeries}
              label={`${t("legendReported")}: ${createdSeries.join(", ")}. ${t("legendFixed")}: ${fixedSeries.join(", ")}.`}
              className="mt-2"
            />

            <div className="mt-4 flex gap-5 text-xs text-muted-foreground border-t border-border pt-3">
              <span className="inline-flex items-center gap-1.5 font-medium">
                <span className="h-[2px] w-4 rounded-full bg-foreground" aria-hidden />
                {t("legendReported")}
              </span>
              <span className="inline-flex items-center gap-1.5 font-medium">
                <span className="w-4 border-t-[1.5px] border-dashed border-subtle-foreground" aria-hidden />
                {t("legendFixed")}
              </span>
            </div>
          </Card>

          {/* What Gets Reported (Last 30 Days) */}
          <Card className="p-5 shadow-xs">
            <div className="mb-4">
              <h2 className="text-base font-bold tracking-tight text-foreground">{t("categoriesTitle")}</h2>
              <p className="text-xs text-muted-foreground">{t("categoriesSubtitle")}</p>
            </div>

            {sortedCategories.length === 0 ? (
              <p className="text-xs text-muted-foreground py-4 text-center">{t("categoriesEmpty")}</p>
            ) : (
              <div className="space-y-3">
                {sortedCategories.map(([categoryKey, count]) => {
                  const Icon = CATEGORY_ICON[categoryKey as Category] ?? Inbox;
                  const pct = totalCategoryReports > 0 ? Math.round((count / totalCategoryReports) * 100) : 0;
                  return (
                    <div key={categoryKey} className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="inline-flex items-center gap-2 font-medium text-foreground">
                          <Icon className="size-3.5 text-muted-foreground" aria-hidden />
                          {tc(categoryKey as Category)}
                        </span>
                        <span className="font-semibold tabular text-muted-foreground">
                          {toLocaleDigits(count, locale)} <span className="text-[11px] font-normal opacity-70">({toLocaleDigits(pct, locale)}%)</span>
                        </span>
                      </div>
                      <div className="h-2 w-full overflow-hidden rounded-full bg-surface-muted">
                        <div
                          className="h-full rounded-full bg-primary transition-all duration-500"
                          style={{ width: `${Math.max(5, pct)}%` }}
                          aria-hidden
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </div>

        {/* Right Column (5 cols): Recently Fixed Feed */}
        <div className="lg:col-span-5 space-y-4">
          <div className="flex items-center justify-between gap-3 border-b border-border/80 pb-2.5">
            <div>
              <h2 className="text-base font-bold tracking-tight text-foreground">{t("recentFixedTitle")}</h2>
              <p className="text-xs text-muted-foreground">{t("recentFixedSubtitle")}</p>
            </div>
            <Link
              href="/?view=resolved"
              className={buttonVariants({ variant: "ghost", size: "sm", className: "h-8 px-2.5 text-xs gap-1 text-primary hover:text-primary font-semibold" })}
            >
              <span>{t("seeAll")}</span>
              <ArrowRight className="size-3" aria-hidden />
            </Link>
          </div>

          {data.resolvedIssues.length === 0 ? (
            <Card className="py-12">
              <EmptyState
                bare
                icon={CheckCircle2}
                title={t("emptyRecentTitle")}
                body={t("emptyRecentBody")}
              />
            </Card>
          ) : (
            <ul className="space-y-3">
              {data.resolvedIssues.map((item: ComplaintListItem) => (
                <li key={item.id}>
                  <IssueCard
                    compact
                    issue={{ ...item, photo_url: item.thumb }}
                    showCategory
                    footer={<LifecycleTrack status={item.status} showLabel={false} className="pt-1" />}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
