import { useLocale } from "next-intl";
import type { LucideIcon } from "lucide-react";
import { cn, toLocaleDigits } from "@/lib/utils";

export type KpiTone = "primary" | "danger" | "warning" | "success" | "accent" | "neutral";

const TONE: Record<KpiTone, string> = {
  primary: "bg-primary-soft text-primary",
  danger: "bg-danger-soft text-danger",
  warning: "bg-p2/12 text-p2",
  success: "bg-p4/12 text-p4",
  accent: "bg-accent/12 text-accent",
  neutral: "bg-surface-muted text-muted-foreground",
};
const LINE: Record<KpiTone, string> = {
  primary: "text-primary",
  danger: "text-danger",
  warning: "text-p2",
  success: "text-p4",
  accent: "text-accent",
  neutral: "text-muted-foreground",
};

/** Inline SVG sparkline (stroke = currentColor). Decorative. */
export function Sparkline({ data, className }: { data: number[]; className?: string }) {
  if (data.length < 2) return null;
  const w = 100;
  const h = 32;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const span = max - min || 1;
  const pts = data.map((v, i) => [(i / (data.length - 1)) * w, h - 2 - ((v - min) / span) * (h - 4)] as const);
  const line = pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = `0,${h} ${line} ${w},${h}`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className={cn("h-8 w-full", className)} aria-hidden>
      <polygon points={area} fill="currentColor" opacity={0.12} />
      <polyline points={line} fill="none" stroke="currentColor" strokeWidth={2} vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

export type KpiCardProps = {
  label: React.ReactNode;
  /** Numbers get Assamese digits in Assamese UI; strings are shown as given (format them yourself). */
  value: number | string;
  /** e.g. "h", "%" — appended after the value. */
  unit?: React.ReactNode;
  icon?: LucideIcon;
  tone?: KpiTone;
  /** Small line under the label (e.g. "+12% vs last week"). */
  hint?: React.ReactNode;
  series?: number[];
  className?: string;
};

export function KpiCard({ label, value, unit, icon: Icon, tone = "primary", hint, series, className }: KpiCardProps) {
  const locale = useLocale();
  const shown = typeof value === "number" ? toLocaleDigits(value, locale) : value;
  return (
    <div className={cn("flex flex-col gap-3 rounded-card border border-border bg-surface p-4 shadow-sm", className)}>
      <div className="flex items-center gap-3">
        {Icon && (
          <span className={cn("grid size-11 shrink-0 place-items-center rounded-xl", TONE[tone])}>
            <Icon className="size-5" aria-hidden />
          </span>
        )}
        <div className="min-w-0">
          <p className="text-2xl font-semibold tabular-nums">
            {shown}
            {unit && <span className="ml-0.5 text-base font-medium text-muted-foreground">{unit}</span>}
          </p>
          <p className="truncate text-sm text-muted-foreground">{label}</p>
        </div>
      </div>
      {series && series.length > 1 && <Sparkline data={series} className={LINE[tone]} />}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
