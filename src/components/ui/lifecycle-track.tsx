import { useTranslations } from "next-intl";
import type { Status } from "@/lib/domain";
import { cn } from "@/lib/utils";

const STEPS = ["reported", "routed", "assigned", "working", "fixed"] as const;

/** Where a status sits on the five-step journey. -1 = off the track (merged / rejected). */
function stepOf(status: Status): number {
  switch (status) {
    case "submitted":
    case "needs_review":
      return 0;
    case "triaged":
      return 1;
    case "assigned":
      return 2;
    case "in_progress":
      return 3;
    case "resolved":
    case "closed":
      return 4;
    default:
      return -1;
  }
}

/**
 * The ticket's journey as one stepped line: reported → routed → assigned → being fixed → fixed.
 * The signature element of the product — the same track on cards, the ticket page and the queue,
 * so "where is my complaint?" is answered by shape before anyone reads a word.
 */
export function LifecycleTrack({
  status,
  size = "sm",
  showLabel = true,
  className,
}: {
  status: Status;
  size?: "sm" | "lg";
  showLabel?: boolean;
  className?: string;
}) {
  const t = useTranslations("track");
  const at = stepOf(status);

  if (at < 0) {
    return (
      <p className={cn("flex items-center gap-2 text-xs text-muted-foreground", className)}>
        <span className="h-px w-6 bg-border-strong" aria-hidden />
        {status === "duplicate" ? t("merged") : t("rejected")}
      </p>
    );
  }

  const done = status === "closed" || status === "resolved";
  const current = status === "needs_review" ? t("inReview") : t(STEPS[at]);

  return (
    <div className={cn("min-w-0", className)}>
      <ol
        aria-label={`${t("label")}: ${current}`}
        className={cn("flex items-center", size === "lg" ? "gap-1.5" : "gap-1")}
      >
        {STEPS.map((s, i) => {
          const reached = i <= at;
          const isNow = i === at && !done;
          return (
            <li key={s} className="flex min-w-0 flex-1 items-center gap-1" aria-current={isNow ? "step" : undefined}>
              <span
                className={cn(
                  "shrink-0 rounded-full transition-colors duration-300",
                  size === "lg" ? "size-2.5" : "size-[7px]",
                  reached ? "bg-foreground" : "bg-border-strong",
                  isNow && "ring-4 ring-foreground/10",
                  done && i === 4 && "bg-success ring-4 ring-success/15",
                )}
                aria-hidden
              />
              {i < STEPS.length - 1 && (
                <span className={cn("h-[2px] flex-1 rounded-full", i < at ? "bg-foreground" : "bg-border")} aria-hidden />
              )}
              <span className="sr-only">{t(s)}</span>
            </li>
          );
        })}
      </ol>
      {showLabel && (
        <p className={cn("mt-2 font-medium", size === "lg" ? "text-sm" : "text-xs", done ? "text-success" : "text-foreground")}>
          {current}
        </p>
      )}
    </div>
  );
}
