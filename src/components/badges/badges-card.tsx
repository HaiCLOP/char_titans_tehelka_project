"use client";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { Award, Flame } from "lucide-react";
import { buttonVariants, Card, CardHeader, EmptyState, ErrorState, Skeleton } from "@/components/ui";
import { cn, toLocaleDigits } from "@/lib/utils";
import { BADGE_ICON } from "./badge-icon";
import { BadgeWatcher } from "./badge-watcher";
import { useMyBadges } from "./use-badges";

/** Profile "Badges" card: earned badges in full, locked ones greyed with progress (e.g. 3/5), plus the streak. */
export function BadgesCard({ userId }: { userId: string }) {
  const t = useTranslations("badges");
  const locale = useLocale();
  const n = (v: number) => toLocaleDigits(v, locale);
  const q = useMyBadges();
  const earned = q.data?.badges.filter((b) => b.earned).length ?? 0;

  return (
    <Card>
      <BadgeWatcher userId={userId} data={q.data} />
      <CardHeader
        title={t("title")}
        icon={<Award className="size-5 text-subtle-foreground" strokeWidth={1.75} aria-hidden />}
        description={q.data ? t("summary", { earned: n(earned), total: n(q.data.badges.length) }) : t("subtitle")}
        className="mb-4"
      />

      {q.isPending ? (
        <div aria-busy className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
          <span className="sr-only">{t("loading")}</span>
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-24 rounded-2xl" />
          ))}
        </div>
      ) : q.isError ? (
        <ErrorState bare onRetry={() => void q.refetch()} retrying={q.isFetching} />
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-2xl bg-surface-muted px-4 py-3 text-sm">
            <span className="inline-flex items-center gap-1.5 font-medium">
              <Flame className="size-4" strokeWidth={1.75} aria-hidden />
              {t("streak.current", { count: q.data.streak.current, n: n(q.data.streak.current) })}
            </span>
            <span className="text-muted-foreground">{t("streak.best", { count: q.data.streak.best, n: n(q.data.streak.best) })}</span>
            {!q.data.streak.this_week && q.data.streak.current > 0 && (
              <span className="w-full text-xs text-muted-foreground">{t("streak.keepGoing")}</span>
            )}
          </div>

          {q.data.reports === 0 && earned === 0 ? (
            <EmptyState
              bare
              icon={Award}
              title={t("emptyTitle")}
              body={t("emptyBody")}
              action={
                <Link href="/report" className={buttonVariants({ size: "md" })}>
                  {t("emptyAction")}
                </Link>
              }
              className="py-6"
            />
          ) : null}

          <ul className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
            {q.data.badges.map((b) => {
              const Icon = BADGE_ICON[b.id];
              const pct = Math.round((b.progress / Math.max(b.target, 1)) * 100);
              return (
                <li
                  key={b.id}
                  className={cn(
                    "flex min-h-24 flex-col rounded-2xl border p-3",
                    b.earned ? "border-border-strong bg-surface" : "border-dashed border-border bg-surface-muted/40",
                  )}
                >
                  <span
                    className={cn(
                      "grid size-9 place-items-center rounded-full",
                      b.earned ? "bg-primary text-primary-foreground" : "bg-surface-sunken text-subtle-foreground",
                    )}
                    aria-hidden
                  >
                    <Icon className="size-4" strokeWidth={1.75} />
                  </span>
                  <span className={cn("mt-2 text-sm font-semibold leading-tight", !b.earned && "text-muted-foreground")}>
                    {t(`items.${b.id}.name`)}
                  </span>
                  <span className="mt-0.5 text-xs leading-snug text-muted-foreground">{t(`items.${b.id}.desc`)}</span>
                  {b.earned ? (
                    <span className="sr-only">{t("earned")}</span>
                  ) : (
                    <div className="mt-auto pt-2">
                      <div
                        className="h-1.5 overflow-hidden rounded-full bg-surface-sunken"
                        role="progressbar"
                        aria-valuemin={0}
                        aria-valuemax={b.target}
                        aria-valuenow={b.progress}
                        aria-label={t("progressAria", { name: t(`items.${b.id}.name`) })}
                      >
                        <div className="h-full rounded-full bg-foreground/40" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="mt-1 block text-xs tabular-nums text-muted-foreground">
                        {t("progress", { progress: n(b.progress), target: n(b.target) })}
                      </span>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}
    </Card>
  );
}
