import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { CheckCircle2, Inbox, Map, Plus } from "lucide-react";
import { AreaTrend, Card, EmptyState, IssueCard, LifecycleTrack, buttonVariants } from "@/components/ui";
import { getProfile, getUser } from "@/lib/auth";
import { ComplaintListQuerySchema, type ComplaintListItem } from "@/lib/domain";
import { createClient } from "@/lib/supabase/server";
import { listComplaints } from "@/lib/tracking";
import { cn, toLocaleDigits } from "@/lib/utils";
import { getCampusDailyBrief } from "@/lib/ai/brief";
import { AiDailyBriefCard } from "@/components/home/ai-daily-brief";

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

  const items = sorted.slice(0, 8);
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

  const created = data.trend.map((r) => Number(r.created));
  const fixed = data.trend.map((r) => Number(r.resolved));
  const s = data.stats;

  return (
    <div className="space-y-6 sm:space-y-8">
      {/* Top Section: Hero (Left) & Campus Intelligence (Right) */}
      <section className="grid gap-5 lg:grid-cols-12 items-start">
        {/* Left Column: Hero Banner */}
        <div className="lg:col-span-7 flex flex-col justify-between rounded-2xl border border-border bg-gradient-to-br from-surface to-surface-muted/50 p-5 sm:p-7 shadow-xs">
          <div className="space-y-3">
            <div className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1 text-xs font-semibold text-primary shadow-xs">
              <span className="size-2 rounded-full bg-primary animate-pulse" aria-hidden />
              {t("hero.eyebrow")} · {t("shell.university")}
            </div>
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl lg:text-4xl text-foreground">
              {t("hero.title")}
            </h1>
            <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed max-w-xl">
              {t("hero.subtitle")}
            </p>
          </div>
          <div className="mt-6 flex flex-wrap items-center gap-2.5">
            <Link
              href="/report"
              className={buttonVariants({
                variant: "primary",
                size: "md",
                className: "justify-center gap-2 shadow-sm rounded-xl px-4 py-2 text-xs sm:text-sm font-semibold",
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
                className: "justify-center gap-2 rounded-xl px-4 py-2 text-xs sm:text-sm font-medium",
              })}
            >
              <Map className="size-4 text-muted-foreground" aria-hidden />
              {t("home.map")}
            </Link>
          </div>
        </div>

        {/* Right Column: Live KPI Metrics & AI Daily Brief (Compact, non-stretching) */}
        <div className="lg:col-span-5 space-y-3 self-start">
          {/* KPI Metrics Strip */}
          <div className="grid grid-cols-4 gap-2 rounded-2xl border border-border bg-surface p-2.5 sm:p-3 text-center shadow-xs">
            <div className="rounded-lg bg-surface-muted/50 p-1.5 sm:p-2">
              <span className="block text-base sm:text-lg font-bold text-warning">{toLocaleDigits(s?.open ?? 0, locale)}</span>
              <span className="text-[10px] sm:text-[11px] font-medium text-muted-foreground truncate block">{t("home.statOpen")}</span>
            </div>
            <div className="rounded-lg bg-surface-muted/50 p-1.5 sm:p-2">
              <span className="block text-base sm:text-lg font-bold text-primary">{toLocaleDigits(s?.in_progress ?? 0, locale)}</span>
              <span className="text-[10px] sm:text-[11px] font-medium text-muted-foreground truncate block">{t("home.statWorking")}</span>
            </div>
            <div className="rounded-lg bg-surface-muted/50 p-1.5 sm:p-2">
              <span className="block text-base sm:text-lg font-bold text-success">{toLocaleDigits(s?.resolved ?? 0, locale)}</span>
              <span className="text-[10px] sm:text-[11px] font-medium text-muted-foreground truncate block">{t("home.statFixed")}</span>
            </div>
            <div className="rounded-lg bg-surface-muted/50 p-1.5 sm:p-2">
              <span className="block text-base sm:text-lg font-bold text-foreground">
                {s?.avg_resolution_hours != null ? `${toLocaleDigits(Number(s.avg_resolution_hours.toFixed(1)), locale)}h` : "—"}
              </span>
              <span className="text-[10px] sm:text-[11px] font-medium text-muted-foreground truncate block">{t("home.statAvg")}</span>
            </div>
          </div>

          {/* AI Campus Daily Brief in Right Sidebar */}
          <AiDailyBriefCard
            bullets={locale === "as" ? data.brief.bullets_as : data.brief.bullets_en}
            title={locale === "as" ? "দৈনিক এআই চৌহদ সাৰাংশ" : "AI Campus Daily Brief"}
            badge={locale === "as" ? "এআই লাইভ" : "AI Live"}
          />
        </div>
      </section>

      {/* Main Content: Issues Section */}
      <section className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border/80 pb-3.5">
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
        ) : data.issues.length === 0 ? (
          <Card className="py-14">
            <EmptyState
              bare
              icon={view === "open" ? Inbox : CheckCircle2}
              title={view === "open" ? t("home.emptyOpenTitle") : t("home.emptyResolvedTitle")}
              body={view === "open" ? t("home.emptyOpenBody") : t("home.emptyResolvedBody")}
              action={view === "open" ? <Link href="/report" className={buttonVariants({ variant: "primary" })}>{t("hero.cta")}</Link> : undefined}
            />
          </Card>
        ) : (
          <ul className="grid gap-3.5 sm:grid-cols-2">
            {data.issues.map((i: ComplaintListItem) => (
              <li key={i.id}>
                <IssueCard
                  compact
                  issue={{ ...i, photo_url: i.thumb }}
                  showCategory
                  footer={<LifecycleTrack status={i.status} showLabel={false} className="pt-1" />}
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Campus Resolution Velocity (Last 14 Days) */}
      {(created.some((v) => v > 0) || fixed.some((v) => v > 0)) && (
        <Card className="p-4 sm:p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="font-semibold text-base tracking-tight">{t("home.pulseTitle")}</h3>
              <p className="mt-0.5 text-xs text-muted-foreground">{t("home.pulseRange")}</p>
            </div>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-success/10 px-2.5 py-0.5 text-xs font-semibold text-success">
              <span className="size-1.5 rounded-full bg-success animate-pulse" />
              {t("home.live")}
            </span>
          </div>
          <AreaTrend
            series={created}
            compare={fixed}
            label={`${t("home.legendReported")}: ${created.join(", ")}. ${t("home.legendFixed")}: ${fixed.join(", ")}.`}
            className="mt-4"
          />
          <div className="mt-3 flex gap-4 text-xs text-muted-foreground border-t border-border pt-2.5">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-[2px] w-3.5 rounded-full bg-foreground" aria-hidden />
              {t("home.legendReported")}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-3.5 border-t-[1.5px] border-dashed border-subtle-foreground" aria-hidden />
              {t("home.legendFixed")}
            </span>
          </div>
        </Card>
      )}
    </div>
  );
}
