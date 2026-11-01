"use client";
import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import type { StaffExperience } from "@/lib/domain";
import { toLocaleDigits } from "@/lib/utils";
import { Celebration } from "./celebration";
import { readSeen, writeSeen } from "./use-badges";

/**
 * One-time level-up moment for field staff: compares the level from /api/staff/experience with the last level
 * this viewer saw (localStorage). The first look only records it. Experience stays private to the person.
 */
export function LevelUpWatcher({ exp }: { exp: StaffExperience | undefined }) {
  const t = useTranslations("badges.levelUp");
  const tl = useTranslations("members.experience");
  const locale = useLocale();
  const [shown, setShown] = useState<StaffExperience | null>(null);

  useEffect(() => {
    if (!exp) return;
    const key = `cs_level_seen:${exp.user_id}`;
    const seen = readSeen<number>(key);
    if (seen === null || exp.level !== seen) writeSeen(key, exp.level);
    // Syncing with an external store (localStorage) after the query resolves.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (typeof seen === "number" && exp.level > seen) setShown(exp);
  }, [exp]);

  if (!shown) return null;
  return (
    <Celebration
      open
      onOpenChange={(o) => !o && setShown(null)}
      title={t("title")}
      body={t("body", { level: tl(`level.${shown.level}`) })}
    >
      <p className="mt-4 inline-flex items-center gap-2 rounded-full bg-primary px-4 py-1.5 text-sm font-semibold text-primary-foreground">
        {tl(`level.${shown.level}`)}
        <span aria-hidden>·</span>
        <span className="tabular-nums">{tl("points", { n: toLocaleDigits(shown.points, locale) })}</span>
      </p>
      <p className="mt-3 text-xs text-muted-foreground">{t("private")}</p>
    </Celebration>
  );
}
