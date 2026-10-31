import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { ArrowRight, CheckCircle2, Inbox } from "lucide-react";
import { CampusBriefCard } from "@/components/brief/brief-card";
import { HomeComposer } from "@/components/home/composer";
import { AreaTrend, Card, EmptyState, IssueCard, LifecycleTrack, buttonVariants } from "@/components/ui";
import { getProfile, getUser } from "@/lib/auth";
import { getCachedCampusBrief } from "@/lib/brief";
import { ComplaintListQuerySchema, type ComplaintListItem } from "@/lib/domain";
import { createClient } from "@/lib/supabase/server";
import { listComplaints } from "@/lib/tracking";
import { cn, toLocaleDigits } from "@/lib/utils";

type Stats = { open: number; in_progress: number; resolved: number; overdue: number; avg_resolution_hours: number | null };
type TrendRow = { day: string; created: number; resolved: number };

// ponytail: cache public stats and 14-day trend in memory (30s TTL). Eliminates ~700ms duplicate RPC roundtrips.
let cachedHomeStats: { stats: Stats | null; trend: TrendRow[]; expiresAt: number } | null = null;
const HOME_STATS_CACHE_TTL = 30 * 1000;

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
  const q = ComplaintListQuerySchema.parse({ scope: "public", status: view === "open" ? "active" : "resolved" });

  const [issues, statsTrend] = await Promise.allSettled([
    listComplaints(supabase, viewer, q),
    getHomeStatsAndTrend(supabase),
  ]);
  const statsAndTrend = statsTrend.status === "fulfilled" ? statsTrend.value : { stats: null, trend: [] };

  return {
    name: profile?.full_name ?? null,
    issues: issues.status === "fulfilled" ? issues.value.items.slice(0, 6) : null,
    stats: statsAndTrend.stats,
    trend: statsAndTrend.trend,
  };
}

export default async function Home({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const { view: rawView } = await searchParams;
  const view = rawView === "resolved" ? "resolved" : "open";
  const [t, locale, data, brief] = await Promise.all([getTranslations(), getLocale(), loadHome(view), getCachedCampusBrief()]);
  const n = (v: number) => toLocaleDigits(v, locale);

  const created = data.trend.map((r) => Number(r.created));
  const fixed = data.trend.map((r) => Number(r.resolved));
  const s = data.stats;

  return (
    <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_22rem] xl:gap-10">
      <div className="min-w-0">
        <header className="max-w-2xl">
          <h1 className="text-display text-[2.5rem] sm:text-[3.25rem]">{t("home.title")}</h1>
          <p className="mt-3 text-[1.0625rem] leading-relaxed text-muted-foreground">{t("home.subtitle")}</p>
        </header>

        <div className="mt-8 max-w-3xl space-y-6">
          <nav aria-label={t("home.title")} className="inline-flex rounded-full bg-surface-sunken/70 p-1 shadow-[inset_0_1px_2px_rgb(0_0_0/0.04)]">
            {(["open", "resolved"] as const).map((v) => (
              <Link
                key={v}
                href={v === "open" ? "/" : "/?view=resolved"}
                scroll={false}
                aria-current={view === v ? "page" : undefined}
                className={cn(
                  "rounded-full px-4 py-2 text-sm font-medium transition-[background-color,color,box-shadow] duration-200",
                  view === v ? "bg-surface text-foreground shadow-sm ring-1 ring-border" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {v === "open" ? t("home.tabOpen") : t("home.tabResolved")}
              </Link>
            ))}
          </nav>

          <HomeComposer name={data.name} />

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
            <ul className="grid gap-4 sm:grid-cols-2">
              {data.issues.map((i: ComplaintListItem) => (
                <li key={i.id}>
                  <IssueCard
                    issue={{ ...i, photo_url: i.thumb }}
                    footer={<LifecycleTrack status={i.status} className="pt-3" />}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <aside className="space-y-6 xl:pt-2">
        <Card className="p-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-title text-lg">{t("home.pulseTitle")}</h2>
              <p className="mt-0.5 text-sm text-muted-foreground">{t("home.pulseRange")}</p>
            </div>
            <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-success">
              <span className="relative flex size-2">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-success opacity-50 motion-reduce:hidden" />
                <span className="relative inline-flex size-2 rounded-full bg-success" />
              </span>
              {t("home.live")}
            </span>
          </div>
          {created.some((v) => v > 0) || fixed.some((v) => v > 0) ? (
            <>
              <AreaTrend
                series={created}
                compare={fixed}
                label={`${t("home.legendReported")}: ${created.join(", ")}. ${t("home.legendFixed")}: ${fixed.join(", ")}.`}
                className="mt-6"
              />
              <div className="mt-4 flex gap-5 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-2"><span className="h-[2px] w-4 rounded-full bg-foreground" aria-hidden />{t("home.legendReported")}</span>
                <span className="inline-flex items-center gap-2"><span className="w-4 border-t-[1.5px] border-dashed border-subtle-foreground" aria-hidden />{t("home.legendFixed")}</span>
              </div>
            </>
          ) : (
            <div className="mt-6 grid h-[120px] place-items-center rounded-2xl bg-surface-muted text-sm text-muted-foreground">{t("home.noData")}</div>
          )}
          <Link
            href="/pulse"
            className="mt-5 inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-full"
          >
            {t("pulse.homeLink")}
            <ArrowRight className="size-4" strokeWidth={1.75} aria-hidden />
          </Link>
        </Card>

        {brief && <CampusBriefCard brief={brief} />}

        <Card className="p-6">
          <h2 className="text-title text-lg">{t("home.weekTitle")}</h2>
          <dl className="mt-4 divide-y divide-border text-sm">
            {[
              { k: t("home.statOpen"), v: s ? n(s.open) : "—" },
              { k: t("home.statWorking"), v: s ? n(s.in_progress) : "—" },
              { k: t("home.statFixed"), v: s ? n(s.resolved) : "—" },
              { k: t("home.statOverdue"), v: s ? n(s.overdue) : "—", alert: (s?.overdue ?? 0) > 0 },
              { k: t("home.statAvg"), v: s?.avg_resolution_hours != null ? t("home.hours", { n: n(s.avg_resolution_hours) }) : "—" },
            ].map((row) => (
              <div key={row.k} className="flex items-baseline justify-between gap-4 py-3 first:pt-0 last:pb-0">
                <dt className="text-muted-foreground">{row.k}</dt>
                <dd className={cn("tabular text-base font-semibold tracking-[-0.01em]", row.alert && "text-danger")}>{row.v}</dd>
              </div>
            ))}
          </dl>
        </Card>

        <Card className="p-6">
          <p className="eyebrow">{t("home.asideEyebrow")}</p>
          <h2 className="text-title mt-3 text-xl">{t("home.asideTitle")}</h2>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{t("home.asideBody")}</p>
          <hr className="my-5 border-border" />
          <p className="text-sm leading-relaxed text-muted-foreground">{t("home.asidePrivacy")}</p>
        </Card>
      </aside>
    </div>
  );
}
