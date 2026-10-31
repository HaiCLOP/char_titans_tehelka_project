import { cn } from "@/lib/utils";
import { Card } from "@/components/ui";

/** Monochrome KPI sheet: label, big tabular value, optional hint. Colour only when it means something. */
export function PulseKpi({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: "success" }) {
  return (
    <Card className="p-5 sm:p-6">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className={cn("tabular mt-2 text-[2.25rem] leading-none font-semibold tracking-[-0.025em]", tone === "success" && "text-success")}>{value}</p>
      {hint && <p className="mt-2.5 text-xs text-muted-foreground">{hint}</p>}
    </Card>
  );
}

/** Horizontal bars, largest first. Accessible as a plain list (label + value). */
export function CategoryBars({ rows }: { rows: { key: string; label: string; value: number; display: string }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <ul className="space-y-3.5">
      {rows.map((r) => (
        <li key={r.key}>
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="min-w-0 truncate text-muted-foreground">{r.label}</span>
            <span className="tabular font-semibold">{r.display}</span>
          </div>
          <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-surface-muted" aria-hidden>
            <div className="h-full rounded-full bg-foreground/80" style={{ width: `${Math.max(2, (r.value / max) * 100)}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}
