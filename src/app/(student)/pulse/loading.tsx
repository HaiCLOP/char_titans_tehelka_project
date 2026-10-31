import { IssueCardSkeleton, Skeleton } from "@/components/ui";

export default function PulseLoading() {
  return (
    <div aria-busy="true">
      <Skeleton className="h-12 w-60 rounded-2xl sm:h-14 sm:w-80" />
      <Skeleton className="mt-4 h-5 w-full max-w-lg" />
      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-32 rounded-card" />
        ))}
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-5">
        <Skeleton className="h-72 rounded-card lg:col-span-3" />
        <Skeleton className="h-72 rounded-card lg:col-span-2" />
      </div>
      <Skeleton className="mt-10 h-7 w-48" />
      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        {[0, 1, 2, 3].map((i) => (
          <IssueCardSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}
