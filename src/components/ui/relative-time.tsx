"use client";
import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { toLocaleDigits } from "@/lib/utils";

/** Translator scoped to the `time` namespace. */
type T = ReturnType<typeof useTranslations>;

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

/** Pure formatter: "5 min ago" / "৫ মিনিট আগতে" / "in 3 h" (uses the `time.*` messages). */
export function formatRelative(date: Date | string | number, now: number, t: T, locale: string): string {
  const ms = new Date(date).getTime() - now;
  const abs = Math.abs(ms);
  const future = ms > 0;
  const fmt = (key: string, count: number) => t(key, { count, n: toLocaleDigits(count, locale) });
  if (abs < MIN) return t("justNow");
  if (abs < HOUR) return fmt(future ? "inMinutes" : "minutesAgo", Math.round(abs / MIN));
  if (abs < DAY) return fmt(future ? "inHours" : "hoursAgo", Math.round(abs / HOUR));
  if (abs < 30 * DAY) return fmt(future ? "inDays" : "daysAgo", Math.round(abs / DAY));
  return fmt(future ? "inMonths" : "monthsAgo", Math.round(abs / (30 * DAY)));
}

export function formatAbsolute(date: Date | string | number, locale: string): string {
  return new Intl.DateTimeFormat(locale === "as" ? "as-IN" : "en-IN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(date));
}

/** Localised relative time that refreshes every minute; full date in the tooltip. */
export function RelativeTime({ date, className, refreshMs = 60_000 }: { date: Date | string | number; className?: string; refreshMs?: number }) {
  const t = useTranslations("time");
  const locale = useLocale();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), refreshMs);
    return () => clearInterval(id);
  }, [refreshMs]);
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return null;
  return (
    <time dateTime={d.toISOString()} title={formatAbsolute(d, locale)} className={className} suppressHydrationWarning>
      {formatRelative(d, now, t, locale)}
    </time>
  );
}
