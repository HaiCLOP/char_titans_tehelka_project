"use client";
import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { AlarmClock, TimerReset } from "lucide-react";
import { OPEN_STATUSES, type Status } from "@/lib/domain";
import { cn, toLocaleDigits } from "@/lib/utils";
import { formatAbsolute } from "@/components/ui";

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

/** "3 h 20 min" style duration using the `sla.*` messages. */
function useDuration() {
  const t = useTranslations("sla");
  const locale = useLocale();
  return (ms: number) => {
    const n = (v: number) => ({ count: v, n: toLocaleDigits(v, locale) });
    if (ms >= 2 * DAY) return t("days", n(Math.round(ms / DAY)));
    if (ms >= HOUR) {
      const h = Math.floor(ms / HOUR);
      const m = Math.round((ms % HOUR) / MIN);
      return m > 0 && h < 10 ? `${t("hours", n(h))} ${t("minutes", n(m))}` : t("hours", n(h));
    }
    return t("minutes", n(Math.max(1, Math.round(ms / MIN))));
  };
}

/** SLA countdown for open tickets ("Due in 3 h" / red "Overdue by 2 days"). Renders nothing when closed or no SLA. */
export function SlaCountdown({ due, status, className }: { due: string | null; status: Status; className?: string }) {
  const t = useTranslations("sla");
  const locale = useLocale();
  const fmt = useDuration();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  if (!due || !(OPEN_STATUSES as readonly Status[]).includes(status)) return null;
  const at = new Date(due).getTime();
  if (Number.isNaN(at)) return null;
  const left = at - now;
  const overdue = left <= 0;
  const Icon = overdue ? AlarmClock : TimerReset;
  return (
    <span
      title={toLocaleDigits(formatAbsolute(at, locale), locale)}
      suppressHydrationWarning
      className={cn(
        "inline-flex items-center gap-1 text-xs font-medium",
        overdue ? "text-danger" : "text-muted-foreground",
        className,
      )}
    >
      <Icon className="size-3.5 shrink-0" aria-hidden />
      {overdue ? t("overdue", { time: fmt(-left) }) : t("dueIn", { time: fmt(left) })}
    </span>
  );
}
