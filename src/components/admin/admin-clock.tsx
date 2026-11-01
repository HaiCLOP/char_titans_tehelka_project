"use client";
import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { CalendarClock } from "lucide-react";

export function AdminClock({ initialTimestamp }: { initialTimestamp: string }) {
  const locale = useLocale();
  const t = useTranslations("nav.admin");
  const [now, setNow] = useState(() => new Date(initialTimestamp));
  useEffect(() => { const timer = window.setInterval(() => setNow(new Date()), 30_000); return () => window.clearInterval(timer); }, []);
  return <div className="flex min-h-10 items-center gap-2 text-xs text-muted-foreground" aria-label={t("dateTime")}>
    <CalendarClock className="size-4 shrink-0" strokeWidth={1.75} aria-hidden />
    <time dateTime={now.toISOString()}>{new Intl.DateTimeFormat(locale === "as" ? "as-IN" : "en-IN", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" }).format(now)}</time>
  </div>;
}
