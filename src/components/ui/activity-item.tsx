import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { RelativeTime } from "./relative-time";

export type ActivityItemProps = {
  /** Icon in a tinted circle; or pass `leading` (e.g. an <Avatar>) instead. */
  icon?: LucideIcon;
  leading?: React.ReactNode;
  tone?: "primary" | "success" | "danger" | "neutral";
  children: React.ReactNode;
  /** ISO timestamp. */
  at: string;
  href?: string;
  className?: string;
};

const TONE = {
  primary: "bg-primary-soft text-primary",
  success: "bg-p4/12 text-p4",
  danger: "bg-p1/12 text-p1",
  neutral: "bg-surface-muted text-muted-foreground",
} as const;

/** One row of "Recent activity". Render inside a <ul>. */
export function ActivityItem({ icon: Icon, leading, tone = "primary", children, at, href, className }: ActivityItemProps) {
  const inner = (
    <>
      {leading ??
        (Icon && (
          <span className={cn("grid size-9 shrink-0 place-items-center rounded-full", TONE[tone])}>
            <Icon className="size-4" aria-hidden />
          </span>
        ))}
      <div className="min-w-0 flex-1">
        <div className="text-sm">{children}</div>
        <RelativeTime date={at} className="text-xs text-muted-foreground" />
      </div>
    </>
  );
  return (
    <li className={className}>
      {href ? (
        <Link href={href} className="-mx-2 flex items-start gap-3 rounded-xl px-2 py-2 transition hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          {inner}
        </Link>
      ) : (
        <div className="flex items-start gap-3 py-2">{inner}</div>
      )}
    </li>
  );
}
