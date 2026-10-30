import { useTranslations } from "next-intl";
import type { LucideIcon } from "lucide-react";
import type { Category, Status } from "@/lib/domain";
import { cn } from "@/lib/utils";
import { CATEGORY_ICON } from "./category-icon";

export type ChipTone = "neutral" | "primary" | "success" | "muted" | "danger" | "warning" | "accent";

const TONE: Record<ChipTone, string> = {
  neutral: "border-border bg-surface-muted text-foreground",
  primary: "border-primary/25 bg-primary-soft text-primary",
  success: "border-p4/30 bg-p4/12 text-foreground",
  muted: "border-border bg-transparent text-muted-foreground",
  danger: "border-p1/30 bg-p1/12 text-foreground",
  warning: "border-p2/30 bg-p2/12 text-foreground",
  accent: "border-accent/30 bg-accent/10 text-foreground",
};

export type ChipProps = React.ComponentProps<"span"> & {
  tone?: ChipTone;
  size?: "sm" | "md";
  icon?: LucideIcon;
  /** Small coloured dot before the label: pass a token bg class, e.g. "bg-p1". */
  dot?: string;
};

export function Chip({ tone = "neutral", size = "sm", icon: Icon, dot, className, children, ...props }: ChipProps) {
  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center gap-1.5 rounded-full border font-medium whitespace-nowrap",
        size === "sm" ? "h-6 px-2.5 text-xs" : "h-8 px-3 text-sm",
        TONE[tone],
        className,
      )}
      {...props}
    >
      {dot && <span className={cn("size-2 shrink-0 rounded-full", dot)} aria-hidden />}
      {Icon && <Icon className="size-3.5 shrink-0" aria-hidden />}
      <span className="truncate">{children}</span>
    </span>
  );
}

export type Priority = 1 | 2 | 3 | 4;

const PRIORITY_DOT: Record<Priority, string> = { 1: "bg-p1", 2: "bg-p2", 3: "bg-p3", 4: "bg-p4" };
const PRIORITY_TONE: Record<Priority, string> = {
  1: "border-p1/35 bg-p1/12",
  2: "border-p2/35 bg-p2/12",
  3: "border-p3/40 bg-p3/15",
  4: "border-p4/35 bg-p4/12",
};

/** P1 Critical (bg-p1) … P4 Low (bg-p4). Text stays foreground for AA contrast; the dot carries the colour. */
export function PriorityChip({ priority, size, className, showCode = false }: { priority: number; size?: "sm" | "md"; className?: string; showCode?: boolean }) {
  const t = useTranslations("priority");
  const p = (Math.min(4, Math.max(1, Math.round(priority))) as Priority);
  return (
    <Chip size={size} dot={PRIORITY_DOT[p]} className={cn("text-foreground", PRIORITY_TONE[p], className)}>
      {showCode ? `P${p} · ${t(String(p))}` : t(String(p))}
    </Chip>
  );
}

/** PRD section 6 status groups. */
export const STATUS_TONE: Record<Status, ChipTone> = {
  submitted: "neutral",
  triaged: "neutral",
  needs_review: "neutral",
  assigned: "primary",
  in_progress: "primary",
  resolved: "success",
  closed: "success",
  duplicate: "muted",
  rejected: "muted",
};

export function CategoryChip({ category, size, className }: { category: Category; size?: "sm" | "md"; className?: string }) {
  const t = useTranslations("category");
  return (
    <Chip size={size} tone="neutral" icon={CATEGORY_ICON[category]} className={className}>
      {t(category)}
    </Chip>
  );
}
