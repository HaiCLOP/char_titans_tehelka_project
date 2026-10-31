import { Sparkles, Activity } from "lucide-react";
import { Card } from "@/components/ui";

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
    <Card className="relative overflow-hidden border-border/80 bg-gradient-to-br from-surface to-surface-muted/40 p-4 sm:p-5 shadow-xs">
      <div className="flex items-center justify-between gap-3 border-b border-border/60 pb-2.5">
        <div className="flex items-center gap-2">
          <span className="grid size-6 place-items-center rounded-md bg-primary/10 text-primary">
            <Sparkles className="size-3.5" aria-hidden />
          </span>
          <h3 className="text-sm font-bold tracking-tight text-foreground">{title}</h3>
        </div>
        <span className="inline-flex items-center gap-1 rounded-full border border-primary/20 bg-primary/5 px-2 py-0.5 text-[10px] font-semibold text-primary">
          <Activity className="size-2.5 animate-pulse" aria-hidden />
          {badge}
        </span>
      </div>

      <ul className="mt-3 space-y-2 text-xs sm:text-[13px] leading-relaxed text-muted-foreground">
        {bullets.map((b, idx) => (
          <li key={idx} className="flex items-start gap-2">
            <span className="mt-1 size-1.5 shrink-0 rounded-full bg-primary" aria-hidden />
            <span className="text-foreground/90">{b}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
