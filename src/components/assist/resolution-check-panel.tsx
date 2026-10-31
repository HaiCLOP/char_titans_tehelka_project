"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { CircleCheck, CircleHelp, CircleX, Images, RotateCw } from "lucide-react";
import type { ResolutionCheck, ResolutionCheckState } from "@/lib/assist/types";
import { cn } from "@/lib/utils";
import { Button, Card, CardHeader, ErrorState, LangText, RelativeTime, Skeleton } from "@/components/ui";
import { apiFetch, isApiError } from "@/components/api-client";

type ResolutionCheckPanelProps = {
  complaintId: string;
  /** Bump when the ticket changes (e.g. after resolve) so photo availability is re-read. */
  version?: string | number;
  className?: string;
};

const VERDICT = {
  resolved: { icon: CircleCheck, tone: "text-success" },
  not_resolved: { icon: CircleX, tone: "text-danger" },
  unclear: { icon: CircleHelp, tone: "text-warning" },
} as const;

/** S15 rail: AI compares the before photo with the after photo. Advisory only — never changes the status. */
export function ResolutionCheckPanel({ complaintId, version, className }: ResolutionCheckPanelProps) {
  const t = useTranslations("assist.check");
  const qc = useQueryClient();
  const key = ["resolution-check", complaintId, version ?? null] as const;
  const url = `/api/complaints/${encodeURIComponent(complaintId)}/check-resolution`;

  const state = useQuery({
    queryKey: key,
    queryFn: ({ signal }) => apiFetch<ResolutionCheckState>(url, { signal }),
    staleTime: 30_000,
    retry: (count, e) => !isApiError(e, "FORBIDDEN") && !isApiError(e, "NOT_FOUND") && count < 2,
  });

  const run = useMutation({
    mutationFn: () => apiFetch<ResolutionCheck>(url, { method: "POST" }),
    onSuccess: (result) => qc.setQueryData<ResolutionCheckState>(key, (s) => (s ? { ...s, result } : s)),
  });

  if (state.isError && (isApiError(state.error, "FORBIDDEN") || isApiError(state.error, "NOT_FOUND"))) return null;

  const s = state.data;
  const result = s?.result ?? null;
  const missing = s && !s.has_before ? t("noBefore") : s && !s.has_after ? t("noAfter") : null;
  const v = result ? VERDICT[result.verdict] : null;

  return (
    <Card className={cn("min-w-0", className)}>
      <CardHeader as="h3" title={t("title")} description={t("description")} className="mb-4" />

      {state.isPending ? (
        <div className="space-y-2" aria-hidden>
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-10 w-full rounded-full" />
        </div>
      ) : state.isError ? (
        <ErrorState bare onRetry={() => void state.refetch()} retrying={state.isFetching} className="py-4" />
      ) : (
        <div className="space-y-4">
          {run.isPending ? (
            <div className="space-y-2" role="status" aria-label={t("running")}>
              <Skeleton className="h-5 w-1/2" />
              <Skeleton className="h-4 w-full" />
              <p className="text-xs text-muted-foreground">{t("running")}</p>
            </div>
          ) : (
            result &&
            v && (
              <div aria-live="polite">
                <p className={cn("flex items-center gap-2 text-sm font-semibold", v.tone)}>
                  <v.icon className="size-4 shrink-0" strokeWidth={1.75} aria-hidden />
                  {t(`verdict.${result.verdict}`)}
                </p>
                <LangText tag="p" en={result.reason_en} as={result.reason_as} className="mt-1.5 text-sm" />
                <p className="mt-1.5 text-xs text-muted-foreground">
                  {t("checked")} <RelativeTime date={result.checked_at} />
                </p>
              </div>
            )
          )}

          {run.isError && (
            <p role="alert" className="text-sm text-danger">
              {t("failed")}
            </p>
          )}

          {missing ? (
            <p className="flex items-start gap-2 text-sm text-muted-foreground">
              <Images className="mt-0.5 size-4 shrink-0" strokeWidth={1.75} aria-hidden />
              {missing}
            </p>
          ) : (
            <Button variant="secondary" block onClick={() => run.mutate()} loading={run.isPending}>
              {!run.isPending && (result ? <RotateCw strokeWidth={1.75} aria-hidden /> : <Images strokeWidth={1.75} aria-hidden />)}
              {result ? t("rerun") : t("run")}
            </Button>
          )}
        </div>
      )}
    </Card>
  );
}
