import { Sparkles, Activity } from "lucide-react";

export function AiDailyBriefCard({
  bullets,
  title = "AI Campus Daily Brief",
  badge = "AI Live",
}: {
  bullets: string[];
  title?: string;
  badge?: string;
}) {
  if (!bullets || bullets.length === 0) return null;

  return (
    <div className="relative overflow-hidden rounded-2xl border border-primary/20 bg-gradient-to-r from-primary-soft/40 via-surface to-surface p-4 sm:p-5 shadow-xs">
      <div className="flex items-center justify-between gap-3 mb-3 border-b border-border/50 pb-2.5">
        <div className="flex items-center gap-2">
          <span className="grid size-6 place-items-center rounded-md bg-primary/10 text-primary">
            <Sparkles className="size-3.5" aria-hidden />
          </span>
          <h2 className="text-xs font-bold uppercase tracking-wider text-primary">{title}</h2>
        </div>
        <span className="inline-flex items-center gap-1 rounded-full border border-primary/20 bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
          <Activity className="size-2.5 animate-pulse" aria-hidden />
          {badge}
        </span>
      </div>

      <div className="grid gap-2 sm:grid-cols-3">
        {bullets.map((b, idx) => (
          <div
            key={idx}
            className="flex items-start gap-2.5 rounded-xl border border-border/60 bg-surface/80 p-3 text-xs leading-relaxed transition-colors hover:border-primary/40 hover:bg-surface"
          >
            <span className="mt-1 size-1.5 shrink-0 rounded-full bg-primary" aria-hidden />
            <span className="text-foreground/90 font-medium">{b}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
