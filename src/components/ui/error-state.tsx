"use client";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { AlertTriangle, RotateCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "./button";

type ErrorStateProps = {
  title?: React.ReactNode;
  body?: React.ReactNode;
  /** Called by Retry (e.g. `query.refetch`). Defaults to `router.refresh()`. */
  onRetry?: () => void;
  retrying?: boolean;
  className?: string;
  bare?: boolean;
};

export function ErrorState({ title, body, onRetry, retrying, className, bare = false }: ErrorStateProps) {
  const t = useTranslations("ui");
  const router = useRouter();
  const [pending, start] = useTransition();
  const retry = onRetry ?? (() => start(() => router.refresh()));
  return (
    <div
      role="alert"
      className={cn(
        "flex flex-col items-center px-4 py-10 text-center",
        !bare && "rounded-card border border-p1/25 bg-surface",
        className,
      )}
    >
      <span className="grid size-12 place-items-center rounded-full bg-p1/12 text-p1">
        <AlertTriangle className="size-6" aria-hidden />
      </span>
      <h3 className="mt-4 font-semibold">{title ?? t("error.title")}</h3>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">{body ?? t("error.body")}</p>
      <Button variant="secondary" className="mt-5" onClick={retry} loading={retrying ?? pending}>
        {!(retrying ?? pending) && <RotateCw aria-hidden />}
        {t("retry")}
      </Button>
    </div>
  );
}
