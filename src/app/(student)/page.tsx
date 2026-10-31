import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { Map, Plus } from "lucide-react";
import { Card, buttonVariants } from "@/components/ui";
import { getProfile, getUser } from "@/lib/auth";
import { ComplaintListQuerySchema, type ComplaintListItem } from "@/lib/domain";
import { createClient } from "@/lib/supabase/server";
import { listComplaints } from "@/lib/tracking";
import { cn, toLocaleDigits } from "@/lib/utils";
import { getCampusDailyBrief } from "@/lib/ai/brief";
import { AiDailyBriefCard } from "@/components/home/ai-daily-brief";
import { IssueFeed } from "@/components/home/issue-feed";

type Stats = { open: number; in_progress: number; resolved: number; overdue: number; avg_resolution_hours: number | null };
type TrendRow = { day: string; created: number; resolved: number };

// ponytail: cache public stats and 14-day trend in memory (30s TTL). Eliminates ~700ms duplicate RPC roundtrips.
let cachedHomeStats: { stats: Stats | null; trend: TrendRow[]; expiresAt: number } | null = null;
const HOME_STATS_CACHE_TTL = 30 * 1000;

// ponytail: cache public home issues in memory (30s TTL). Eliminates ~1200ms of storage signing and postgrest queries per view.
const cachedHomeIssues: Record<string, { items: ComplaintListItem[]; expiresAt: number }> = {};
const HOME_ISSUES_CACHE_TTL = 30 * 1000;

async function getHomeIssues(
  supabase: Awaited<ReturnType<typeof createClient>>,
  viewer: { id: string; profile: NonNullable<Awaited<ReturnType<typeof getProfile>>> } | null,
  view: "open" | "resolved",
) {
  const now = Date.now();
  const cached = cachedHomeIssues[view];
  if (cached && cached.expiresAt > now) {
    return cached.items;
  }
  const q = ComplaintListQuerySchema.parse({ scope: "public", status: view === "open" ? "active" : "resolved" });
  const res = await listComplaints(supabase, viewer, q);
  
  // Arrange complaints strictly based on severity: Critical (P1) -> High (P2) -> Medium (P3) -> Low (P4), then newest first
  const sorted = [...res.items].sort((a, b) => {
    if (a.priority !== b.priority) {
      return a.priority - b.priority;
    }
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });

  const items = sorted.slice(0, 24);
  cachedHomeIssues[view] = { items, expiresAt: now + HOME_ISSUES_CACHE_TTL };
  return items;
}

async function getHomeStatsAndTrend(supabase: Awaited<ReturnType<typeof createClient>>) {
  const now = Date.now();
  if (cachedHomeStats && cachedHomeStats.expiresAt > now) {
    return { stats: cachedHomeStats.stats, trend: cachedHomeStats.trend };
  }
  const [stats, trend] = await Promise.allSettled([
    supabase.rpc("dashboard_stats"),
    supabase.rpc("trend_by_day", { days: 14 }),
  ]);
  const s = stats.status === "fulfilled" ? ((stats.value.data as Stats | null) ?? null) : null;
  const t = trend.status === "fulfilled" ? ((trend.value.data as TrendRow[] | null) ?? []) : [];
  if (s !== null || t.length > 0) {
    cachedHomeStats = { stats: s, trend: t, expiresAt: now + HOME_STATS_CACHE_TTL };
  }
  return { stats: s, trend: t };
}

async function loadHome(view: "open" | "resolved") {
  const supabase = await createClient();
  const [user, profile] = await Promise.all([getUser(), getProfile()]);
  const viewer = user && profile ? { id: user.id, profile } : null;

  const [issues, statsTrend] = await Promise.allSettled([
    getHomeIssues(supabase, viewer, view),
    getHomeStatsAndTrend(supabase),
  ]);
  const statsAndTrend = statsTrend.status === "fulfilled" ? statsTrend.value : { stats: null, trend: [] };
  const brief = await getCampusDailyBrief(supabase, statsAndTrend.stats);

  return {
    name: profile?.full_name ?? null,
    issues: issues.status === "fulfilled" ? issues.value : null,
    stats: statsAndTrend.stats,
    trend: statsAndTrend.trend,
    brief,
  };
}

export default async function Home({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const { view: rawView } = await searchParams;
  const view = rawView === "resolved" ? "resolved" : "open";
  const [t, locale, data] = await Promise.all([getTranslations(), getLocale(), loadHome(view)]);

  const s = data.stats;

  return (
    <div className="space-y-6 sm:space-y-7">
      {/* Executive Hero Banner with Integrated 4-Tile KPI Matrix */}
      <section className="relative overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-surface via-surface to-surface-muted/60 p-5 sm:p-7 shadow-xs">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
          {/* Left: Branding & Core CTA */}
          <div className="max-w-xl space-y-3">
            <div className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1 text-xs font-semibold text-primary shadow-2xs">
              <span className="size-2 rounded-full bg-primary animate-pulse" aria-hidden />
              {t("hero.eyebrow")} · {t("shell.university")}
            </div>
            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold tracking-tight text-foreground">
              {t("hero.title")}
            </h1>
            <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
              {t("hero.subtitle")}
            </p>
            <div className="pt-2 flex flex-wrap items-center gap-3">
              <Link
                href="/report"
                className={buttonVariants({
                  variant: "primary",
                  size: "md",
                  className: "rounded-xl px-5 gap-2 shadow-sm font-semibold",
                })}
              >
                <Plus className="size-4" strokeWidth={2.5} aria-hidden />
                {t("hero.cta")}
              </Link>
              <Link
                href="/map"
                className={buttonVariants({
                  variant: "secondary",
                  size: "md",
                  className: "rounded-xl px-5 gap-2 font-medium",
                })}
              >
                <Map className="size-4 text-muted-foreground" aria-hidden />
                {t("home.map")}
              </Link>
            </div>
          </div>

          {/* Right: Integrated 4-Tile KPI Matrix (2x2 layout, zero text truncation) */}
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-2 gap-2.5 sm:gap-3 w-full lg:w-80 shrink-0">
            <div className="rounded-xl border border-border/80 bg-surface p-3 sm:p-3.5 shadow-2xs text-center transition-all hover:border-warning/50">
              <span className="text-2xl sm:text-3xl font-extrabold text-warning tabular-nums">
                {toLocaleDigits(s?.open ?? 0, locale)}
              </span>
              <span className="mt-1 block text-xs font-medium text-muted-foreground">{t("home.statOpen")}</span>
            </div>
            <div className="rounded-xl border border-border/80 bg-surface p-3 sm:p-3.5 shadow-2xs text-center transition-all hover:border-primary/50">
              <span className="text-2xl sm:text-3xl font-extrabold text-primary tabular-nums">
                {toLocaleDigits(s?.in_progress ?? 0, locale)}
              </span>
              <span className="mt-1 block text-xs font-medium text-muted-foreground">{t("home.statWorking")}</span>
            </div>
            <div className="rounded-xl border border-border/80 bg-surface p-3 sm:p-3.5 shadow-2xs text-center transition-all hover:border-success/50">
              <span className="text-2xl sm:text-3xl font-extrabold text-success tabular-nums">
                {toLocaleDigits(s?.resolved ?? 0, locale)}
              </span>
              <span className="mt-1 block text-xs font-medium text-muted-foreground">{t("home.statFixed")}</span>
            </div>
            <div className="rounded-xl border border-border/80 bg-surface p-3 sm:p-3.5 shadow-2xs text-center transition-all hover:border-border-strong">
              <span className="text-2xl sm:text-3xl font-extrabold text-foreground tabular-nums">
                {s?.avg_resolution_hours != null ? `${toLocaleDigits(Number(s.avg_resolution_hours.toFixed(1)), locale)}h` : "—"}
              </span>
              <span className="mt-1 block text-xs font-medium text-muted-foreground">{t("home.statAvg")}</span>
            </div>
          </div>
        </div>
      </section>

      {/* AI Campus Daily Brief (Sleek Horizontal 3-Column Strip) */}
      <AiDailyBriefCard
        bullets={locale === "as" ? data.brief.bullets_as : data.brief.bullets_en}
        title={locale === "as" ? "দৈনিক এআই চৌহদ সাৰাংশ" : "AI Campus Daily Brief"}
        badge={locale === "as" ? "এআই লাইভ" : "AI Live"}
      />

      {/* Main Content: Issues Section */}
      <section className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border/80 pb-3">
          <div>
            <h2 className="text-lg font-bold tracking-tight text-foreground">
              {view === "open" ? t("home.tabOpen") : t("home.tabResolved")}
            </h2>
            <p className="text-xs text-muted-foreground">
              {t("home.slogan")}
            </p>
          </div>

          <nav aria-label={t("home.title")} className="inline-flex self-start sm:self-auto rounded-full bg-surface-muted/80 p-1 border border-border/60">
            {(["open", "resolved"] as const).map((v) => (
              <Link
                key={v}
                href={v === "open" ? "/" : "/?view=resolved"}
                scroll={false}
                aria-current={view === v ? "page" : undefined}
                className={cn(
                  "rounded-full px-3.5 py-1.5 text-xs font-medium transition-all duration-200",
                  view === v
                    ? "bg-surface text-foreground shadow-xs ring-1 ring-border font-semibold"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {v === "open" ? t("home.tabOpen") : t("home.tabResolved")}
              </Link>
            ))}
          </nav>
        </div>

        {data.issues === null ? (
          <Card className="border-danger-border bg-danger-soft text-sm text-danger">{t("home.loadError")}</Card>
        ) : (
          <IssueFeed issues={data.issues} view={view} />
        )}
      </section>
    </div>
  );
}
