"use client";
import { useEffect } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { AlertTriangle, RotateCw } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui";

// S25 — bilingual error page (Next 16: `retry` re-fetches and re-renders the segment).
export default function ErrorPage({ error, retry }: { error: unknown; retry: () => void }) {
  const t = useTranslations("errors");
  useEffect(() => {
    console.error(error);
  }, [error]);
  const digest = error instanceof Error && "digest" in error ? String((error as Error & { digest?: string }).digest ?? "") : "";
  return (
    <main className="grid min-h-dvh place-items-center bg-background px-4 py-10">
      <div role="alert" className="w-full max-w-md rounded-card border border-border bg-surface p-8 text-center shadow-sm">
        <span className="mx-auto grid size-16 place-items-center rounded-full bg-p1/12 text-danger">
          <AlertTriangle className="size-8" aria-hidden />
        </span>
        <h1 className="text-display mt-4 text-[2rem]">{t("errorTitle")}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{t("errorBody")}</p>
        {digest && <p className="mt-2 font-mono text-xs text-muted-foreground">{digest}</p>}
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <Button onClick={() => retry()}>
            <RotateCw aria-hidden />
            {t("retry")}
          </Button>
          <Link href="/" className={buttonVariants({ variant: "secondary" })}>
            {t("goHome")}
          </Link>
        </div>
      </div>
    </main>
  );
}
