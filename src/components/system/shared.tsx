"use client";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import type { Attempt } from "@/lib/ai/types";
import type { KeyRowOut } from "@/lib/sys";
import { cn, toLocaleDigits } from "@/lib/utils";

export type { Attempt };

/** Locale-aware number/time formatters for the panel (Assamese digits in Assamese). */
export function useFmt() {
  const locale = useLocale();
  const t = useTranslations("sys.common");
  const tag = locale === "as" ? "as-IN" : "en-IN";
  return {
    n: (v: number) => toLocaleDigits(v, locale),
    ms: (v: number | null | undefined) => (v === null || v === undefined ? t("dash") : t("ms", { n: toLocaleDigits(v, locale) })),
    pct: (v: number | null) => (v === null ? t("dash") : `${toLocaleDigits(Math.round(v * 100), locale)}%`),
    time: (iso: string | null | undefined) =>
      iso ? toLocaleDigits(new Date(iso).toLocaleTimeString(tag, { hour: "2-digit", minute: "2-digit", second: "2-digit" }), locale) : t("dash"),
    dateTime: (iso: string) =>
      toLocaleDigits(new Date(iso).toLocaleString(tag, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", second: "2-digit" }), locale),
  };
}

const STATUS_TONE: Record<string, string> = {
  ok: "text-success",
  rate_limited: "text-danger",
  error: "text-danger",
  timeout: "text-danger",
  invalid: "text-danger",
  no_model: "text-danger",
  skipped: "text-muted-foreground",
  fallback: "text-warning",
};

/** Attempt / log status word, coloured only by meaning. */
export function StatusText({ status, className }: { status: string; className?: string }) {
  const t = useTranslations("sys.status");
  const known = status in STATUS_TONE;
  return (
    <span className={cn("font-medium", STATUS_TONE[status] ?? "text-muted-foreground", className)}>
      {known ? t(status as "ok") : status}
    </span>
  );
}

/** ok / cooling down until … / simulated failure / disabled. */
export function KeyStatusText({ k, className }: { k: Pick<KeyRowOut, "status" | "cooldownUntil">; className?: string }) {
  const t = useTranslations("sys.keyStatus");
  const f = useFmt();
  const tone = { ok: "text-success", cooling: "text-danger", simulated: "text-warning", disabled: "text-muted-foreground" }[k.status];
  return (
    <span className={cn("font-medium", tone, className)}>
      {k.status === "cooling" ? t("cooling", { time: f.time(k.cooldownUntil) }) : t(k.status)}
    </span>
  );
}

/** Ordered attempt chain: provider/model · key · status · latency. */
export function AttemptList({ attempts }: { attempts: Attempt[] }) {
  const f = useFmt();
  return (
    <ol className="divide-y divide-border text-sm">
      {attempts.map((a, i) => (
        <li key={i} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 py-2">
          <span className="tabular w-5 shrink-0 text-muted-foreground">{f.n(i + 1)}</span>
          <span className="min-w-0 font-mono text-[0.8125rem] break-all">{a.provider}/{a.model}</span>
          <span className="text-muted-foreground">{a.keyLabel}</span>
          <StatusText status={a.status} />
          <span className="tabular ml-auto text-muted-foreground">{f.ms(a.latencyMs)}</span>
          {a.error && <p className="w-full pl-8 text-xs break-words text-muted-foreground">{a.error}</p>}
        </li>
      ))}
    </ol>
  );
}

/** Toast after a change: saved + whether the Go engine reloaded at once. */
export function useChangeToast() {
  const t = useTranslations("sys.common");
  return (message: string, res?: { engine?: boolean | null }) => {
    toast.success(message, { description: res?.engine === false ? t("engineNotSynced") : res?.engine ? t("engineSynced") : undefined });
  };
}

/** A hairline-divided definition row. */
export function Row({ label, children }: { label: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="tabular min-w-0 text-right break-words">{children}</dd>
    </div>
  );
}
