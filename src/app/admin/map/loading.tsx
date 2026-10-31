import { Skeleton } from "@/components/ui";

export default function AdminMapLoading() {
  return (
    <div aria-busy="true" className="mx-auto max-w-[84rem]">
      <Skeleton className="h-11 w-64 rounded-2xl sm:h-12 sm:w-80" />
      <Skeleton className="mt-3 h-5 w-full max-w-md" />
      <div className="mt-6 space-y-3">
        {Array.from({ length: 3 }, (_, r) => (
          <div key={r} className="flex gap-2">
            {Array.from({ length: 5 }, (_, i) => (
              <Skeleton key={i} className="h-9 w-20 rounded-full" />
            ))}
          </div>
        ))}
      </div>
      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <Skeleton className="aspect-[3/4] rounded-card sm:aspect-[4/3] lg:aspect-[16/11]" />
        <Skeleton className="h-96 rounded-card" />
      </div>
    </div>
  );
}
