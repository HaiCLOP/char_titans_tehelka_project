"use client";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { Award, Flame } from "lucide-react";
import { toLocaleDigits } from "@/lib/utils";
import { BadgeWatcher } from "./badge-watcher";
import { useMyBadges } from "./use-badges";

/** Compact home-page chip: weekly reporting streak + badge count, links to the profile's Badges card. */
export function StreakChip({ userId }: { userId: string }) {
  const t = useTranslations("badges");
  const locale = useLocale();
  const q = useMyBadges();
  if (!q.data) return null; // quiet while loading or on error: the full card on the profile has the states
  const n = (v: number) => toLocaleDigits(v, locale);
  const earned = q.data.badges.filter((b) => b.earned).length;
  const { current } = q.data.streak;
  return (
    <>
      <BadgeWatcher userId={userId} data={q.data} />
      <Link
        href="/profile#badges"
        className="inline-flex min-h-10 items-center gap-3 rounded-full border border-border bg-surface px-4 py-2 text-sm shadow-xs transition-colors hover:border-border-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label={t("chipAria", { streak: n(current), badges: n(earned) })}
      >
        <span className="inline-flex items-center gap-1.5 font-semibold">
          <Flame className="size-4" strokeWidth={1.75} aria-hidden />
          {current > 0 ? t("chipStreak", { count: current, n: n(current) }) : t("chipNoStreak")}
        </span>
        <span aria-hidden className="h-4 w-px bg-border" />
        <span className="inline-flex items-center gap-1.5 text-muted-foreground">
          <Award className="size-4" strokeWidth={1.75} aria-hidden />
          {t("chipBadges", { count: earned, n: n(earned) })}
        </span>
      </Link>
    </>
  );
}
