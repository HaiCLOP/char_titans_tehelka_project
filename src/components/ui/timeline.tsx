import { useTranslations } from "next-intl";
import { ArrowRightLeft, Bot, CirclePlus, MessageSquareText, ThumbsUp, UserCheck, CircleDot, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { RelativeTime } from "./relative-time";

/** `complaint_events.type` values plus anything custom. */
export type TimelineEventType = "created" | "status" | "assigned" | "note" | "metoo" | "ai" | (string & {});

export type TimelineItem = {
  id: string | number;
  type: TimelineEventType;
  title: React.ReactNode;
  body?: React.ReactNode;
  /** ISO timestamp. */
  at: string;
  /** Who did it (name / "Anonymous"). */
  actor?: React.ReactNode;
  /** Highlight (e.g. the current status). */
  highlight?: boolean;
};

const ICON: Record<string, LucideIcon> = {
  created: CirclePlus,
  status: ArrowRightLeft,
  assigned: UserCheck,
  note: MessageSquareText,
  metoo: ThumbsUp,
  ai: Bot,
};

/** Vertical timeline, newest last by default (pass items in the order you want shown). */
export function Timeline({ items, className, emptyText }: { items: TimelineItem[]; className?: string; emptyText?: React.ReactNode }) {
  const t = useTranslations("ui");
  if (items.length === 0) return <p className={cn("text-sm text-muted-foreground", className)}>{emptyText ?? t("timelineEmpty")}</p>;
  return (
    <ol className={cn("relative space-y-5", className)}>
      {items.map((item, i) => {
        const Icon = ICON[item.type] ?? CircleDot;
        const last = i === items.length - 1;
        return (
          <li key={item.id} className="relative flex gap-3">
            {!last && <span aria-hidden className="absolute top-9 bottom-[-1.25rem] left-[1.0625rem] w-px bg-border" />}
            <span
              className={cn(
                "relative grid size-9 shrink-0 place-items-center rounded-full border",
                item.highlight ? "border-primary bg-primary text-primary-foreground" : "border-border bg-surface-muted text-muted-foreground",
              )}
            >
              <Icon className="size-4" aria-hidden />
            </span>
            <div className="min-w-0 flex-1 pt-1">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                <p className="text-sm font-medium">{item.title}</p>
                <RelativeTime date={item.at} className="text-xs text-muted-foreground" />
              </div>
              {item.actor && <p className="text-xs text-muted-foreground">{item.actor}</p>}
              {item.body && <div className="mt-1 text-sm text-muted-foreground">{item.body}</div>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
