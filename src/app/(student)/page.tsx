import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { Activity, Map } from "lucide-react";
import { Card } from "@/components/ui";
import { getProfile, getUser } from "@/lib/auth";
import { ComplaintListQuerySchema, type ComplaintListItem } from "@/lib/domain";
import { createClient } from "@/lib/supabase/server";
import { listComplaints } from "@/lib/tracking";
import { cn, toLocaleDigits } from "@/lib/utils";
import { getCampusDailyBrief } from "@/lib/ai/brief";
import { HomeComposer } from "@/components/home/composer";
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
  const avatar = user ? { id: user.id, character: profile?.avatar_character ?? null, src: profile?.avatar_url ?? null } : null;

  const [issues, statsTrend] = await Promise.allSettled([
    getHomeIssues(supabase, viewer, view),
    getHomeStatsAndTrend(supabase),
  ]);
  const statsAndTrend = statsTrend.status === "fulfilled" ? statsTrend.value : { stats: null, trend: [] };
  const brief = await getCampusDailyBrief(supabase, statsAndTrend.stats);

  return {
    name: profile?.full_name ?? null,
    avatar,
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
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px] xl:grid-cols-[minmax(0,1fr)_360px] items-start">
      {/* ============================================================ */}
      {/* LEFT COLUMN (BIG): Quick Report Composer + All Issues Feed   */}
      {/* ============================================================ */}
      <div className="space-y-6 min-w-0">
        {/* 1. Quick Report Composer ("What needs fixing? like this but better") */}
        <HomeComposer name={data.name} avatar={data.avatar} />

        {/* Mobile-only 4-Stat Metric Strip (< lg) */}
        <div className="lg:hidden">
          <div className="rounded-2xl border border-border bg-surface p-3.5 shadow-xs space-y-2.5">
            <div className="flex items-center justify-between border-b border-border/60 pb-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                {t("home.weekTitle")}
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" aria-hidden />
                {t("home.live")}
              </span>
            </div>
            <div className="grid grid-cols-4 gap-2 text-center">
              <div className="rounded-xl border border-border/70 bg-surface-muted/30 p-2">
                <span className="text-xl font-black text-warning tabular-nums">
                  {toLocaleDigits(s?.open ?? 0, locale)}
                </span>
                <span className="mt-0.5 block text-[10px] font-medium text-muted-foreground truncate">{t("home.statOpen")}</span>
              </div>
              <div className="rounded-xl border border-border/70 bg-surface-muted/30 p-2">
                <span className="text-xl font-black text-primary tabular-nums">
                  {toLocaleDigits(s?.in_progress ?? 0, locale)}
                </span>
                <span className="mt-0.5 block text-[10px] font-medium text-muted-foreground truncate">{t("home.statWorking")}</span>
              </div>
              <div className="rounded-xl border border-border/70 bg-surface-muted/30 p-2">
                <span className="text-xl font-black text-success tabular-nums">
                  {toLocaleDigits(s?.resolved ?? 0, locale)}
                </span>
                <span className="mt-0.5 block text-[10px] font-medium text-muted-foreground truncate">{t("home.statFixed")}</span>
              </div>
              <div className="rounded-xl border border-border/70 bg-surface-muted/30 p-2">
                <span className="text-xl font-black text-foreground tabular-nums">
                  {s?.avg_resolution_hours != null ? `${toLocaleDigits(Number(s.avg_resolution_hours.toFixed(1)), locale)}h` : `${toLocaleDigits(0, locale)}h`}
                </span>
                <span className="mt-0.5 block text-[10px] font-medium text-muted-foreground truncate">{t("home.statAvg")}</span>
              </div>
            </div>
          </div>
        </div>

        {/* 2. All Issues Section */}
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

      {/* ============================================================ */}
      {/* RIGHT COLUMN (SMALL): 4 KPIs + AI Campus Daily Brief         */}
      {/* ============================================================ */}
      <aside className="space-y-5 lg:sticky lg:top-20">
        {/* 1. Desktop 4-Metric Tile Card: Open, Being fixed, Fixed, Avg Fix Time */}
        <div className="hidden lg:block rounded-2xl border border-border bg-surface p-4 sm:p-5 shadow-xs space-y-3.5">
          <div className="flex items-center justify-between border-b border-border/60 pb-2.5">
            <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              {t("home.weekTitle")}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
              <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" aria-hidden />
              {t("home.live")}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            {/* 1 Open */}
            <div className="rounded-xl border border-border/80 bg-surface-muted/30 p-3 text-center transition-all hover:border-warning/50">
              <span className="text-2xl sm:text-3xl font-extrabold text-warning tabular-nums">
                {toLocaleDigits(s?.open ?? 0, locale)}
              </span>
              <span className="mt-1 block text-xs font-medium text-muted-foreground">{t("home.statOpen")}</span>
            </div>

            {/* 2 Being fixed */}
            <div className="rounded-xl border border-border/80 bg-surface-muted/30 p-3 text-center transition-all hover:border-primary/50">
              <span className="text-2xl sm:text-3xl font-extrabold text-primary tabular-nums">
                {toLocaleDigits(s?.in_progress ?? 0, locale)}
              </span>
              <span className="mt-1 block text-xs font-medium text-muted-foreground">{t("home.statWorking")}</span>
            </div>

            {/* 0 Fixed */}
            <div className="rounded-xl border border-border/80 bg-surface-muted/30 p-3 text-center transition-all hover:border-success/50">
              <span className="text-2xl sm:text-3xl font-extrabold text-success tabular-nums">
                {toLocaleDigits(s?.resolved ?? 0, locale)}
              </span>
              <span className="mt-1 block text-xs font-medium text-muted-foreground">{t("home.statFixed")}</span>
            </div>

            {/* 0h Avg Fix Time */}
            <div className="rounded-xl border border-border/80 bg-surface-muted/30 p-3 text-center transition-all hover:border-border-strong">
              <span className="text-2xl sm:text-3xl font-extrabold text-foreground tabular-nums">
                {s?.avg_resolution_hours != null ? `${toLocaleDigits(Number(s.avg_resolution_hours.toFixed(1)), locale)}h` : `${toLocaleDigits(0, locale)}h`}
              </span>
              <span className="mt-1 block text-xs font-medium text-muted-foreground">{t("home.statAvg")}</span>
            </div>
          </div>
        </div>

        {/* 2. AI Campus Daily Brief (Vertical stack on right rail) */}
        <AiDailyBriefCard
          vertical
          bullets={locale === "as" ? data.brief.bullets_as : data.brief.bullets_en}
          title={locale === "as" ? "দৈনিক এআই চৌহদ সাৰাংশ" : "AI Campus Daily Brief"}
          badge={locale === "as" ? "এআই লাইভ" : "AI Live"}
        />

        {/* 3. Helpful Navigation Shortcuts */}
        <div className="rounded-2xl border border-border/70 bg-surface/50 p-4 space-y-2.5">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            {locale === "as" ? "দ্ৰুত সংযোগ" : "Quick Actions"}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Link
              href="/map"
              className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-border bg-surface px-3 py-2 text-xs font-medium text-foreground hover:bg-surface-muted hover:border-primary/40 transition-colors shadow-2xs"
            >
              <Map className="size-3.5 text-primary" aria-hidden />
              <span>{t("home.map")}</span>
            </Link>
            <Link
              href="/pulse"
              className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-border bg-surface px-3 py-2 text-xs font-medium text-foreground hover:bg-surface-muted hover:border-warning/40 transition-colors shadow-2xs"
            >
              <Activity className="size-3.5 text-warning" aria-hidden />
              <span>{locale === "as" ? "চৌহদ স্পন্দন" : "Campus Pulse"}</span>
            </Link>
          </div>
        </div>
      </aside>
    </div>
  );
}
