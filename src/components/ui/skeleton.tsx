import { cn } from "@/lib/utils";

/** Decorative placeholder. Wrap a group of skeletons in an element with `aria-busy` + a visually hidden label. */
export function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return <div aria-hidden className={cn("animate-pulse rounded-md bg-surface-muted", className)} {...props} />;
}

export function SkeletonText({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div className={cn("space-y-2", className)} aria-hidden>
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} className={cn("h-3.5", i === lines - 1 ? "w-3/5" : "w-full")} />
      ))}
    </div>
  );
}

export function IssueCardSkeleton() {
  return (
    <div className="flex items-start gap-3 rounded-card border border-border bg-surface p-3 sm:p-3.5 shadow-sm" aria-hidden>
      <Skeleton className="size-20 sm:size-24 shrink-0 rounded-xl" />
      <div className="flex-1 space-y-2">
        <div className="flex gap-1.5">
          <Skeleton className="h-5 w-16 rounded-full" />
          <Skeleton className="h-5 w-20 rounded-full" />
        </div>
        <Skeleton className="h-4 w-4/5" />
        <Skeleton className="h-3 w-1/2" />
      </div>
    </div>
  );
}

export function KpiCardSkeleton() {
  return (
    <div className="flex items-center gap-4 rounded-card border border-border bg-surface p-4 shadow-sm" aria-hidden>
      <Skeleton className="size-11 rounded-xl" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-6 w-16" />
        <Skeleton className="h-3 w-24" />
      </div>
    </div>
  );
}

export function ListSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-3" aria-hidden>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-3">
          <Skeleton className="size-9 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3.5 w-3/4" />
            <Skeleton className="h-3 w-1/3" />
          </div>
        </div>
      ))}
    </div>
  );
}
