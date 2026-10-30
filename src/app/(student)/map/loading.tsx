import { Skeleton } from "@/components/ui";

export default function MapLoading() {
  return (
    <div aria-busy="true">
      <Skeleton className="h-12 w-64 rounded-2xl sm:h-14 sm:w-80" />
      <Skeleton className="mt-4 h-5 w-full max-w-lg" />
      <div className="mt-8 flex flex-wrap gap-2">
        {Array.from({ length: 5 }, (_, i) => (
          <Skeleton key={i} className="h-9 w-24 rounded-full" />
        ))}
      </div>
      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <Skeleton className="aspect-[3/4] rounded-card sm:aspect-[4/3] lg:aspect-[16/11]" />
        <Skeleton className="h-96 rounded-card" />
      </div>
    </div>
  );
}
