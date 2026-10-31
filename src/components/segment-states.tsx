"use client";
import { useEffect } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { ErrorState, Skeleton, buttonVariants } from "@/components/ui";

/** Route-segment loading skeleton (inside the shell, so navigation stays visible). */
export function PageSkeleton() {
  const t = useTranslations("ui");
  return (
    <div aria-busy="true" aria-live="polite">
      <span className="sr-only">{t("loading")}</span>
      <Skeleton className="h-11 w-56 rounded-2xl sm:h-14 sm:w-80" />
      <Skeleton className="mt-4 h-4 w-full max-w-md" />
      <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-24 rounded-card" />
        ))}
      </div>
      <Skeleton className="mt-6 h-72 rounded-card" />
    </div>
  );
}

/** Route-segment error boundary body: Retry (re-fetches the segment) + Go home, inside the shell. */
export function SegmentError({ error, retry }: { error: unknown; retry: () => void }) {
  const t = useTranslations("ui");
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div className="mx-auto max-w-xl pt-6">
      <ErrorState onRetry={() => retry()} />
      <div className="mt-3 text-center">
        <Link href="/" className={buttonVariants({ variant: "ghost" })}>
          {t("goHome")}
        </Link>
      </div>
    </div>
  );
}
