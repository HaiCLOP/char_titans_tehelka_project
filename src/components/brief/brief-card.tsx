"use client";
import { useQuery } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { CloudOff } from "lucide-react";
import { ApiError, apiFetch, isApiError } from "@/components/api-client";
import { Card, EmptyState, ErrorState, RelativeTime, Skeleton } from "@/components/ui";
import { cn } from "@/lib/utils";

export type BriefData = { en: string[]; as: string[]; generated_at: string; model: string };

/** The three bullets in the reader's language, plus when they were written. */
export function BriefView({ brief, note }: { brief: BriefData; note: string }) {
  const t = useTranslations("brief");
  const locale = useLocale();
  const bullets = locale === "as" ? brief.as : brief.en;
  return (
    <>
      <ol className="mt-5 space-y-3.5">
        {bullets.map((b, i) => (
          <li key={i} className="flex gap-3 text-sm leading-relaxed">
            <span className="tabular w-4 shrink-0 pt-px text-xs font-semibold text-subtle-foreground" aria-hidden>
              {locale === "as" ? ["১", "২", "৩"][i] : i + 1}
            </span>
            <span lang={locale} className="min-w-0">{b}</span>
          </li>
        ))}
      </ol>
      <p className="mt-5 border-t border-border pt-4 text-xs leading-relaxed text-muted-foreground">
        {note} {t("written")} <RelativeTime date={brief.generated_at} />.
      </p>
    </>
  );
}

function Header({ subtitle }: { subtitle: string }) {
  const t = useTranslations("brief");
  return (
    <div>
      <p className="eyebrow">{t("eyebrow")}</p>
      <h2 className="text-title mt-2 text-lg">{t("title")}</h2>
      <p className="mt-0.5 text-sm text-muted-foreground">{subtitle}</p>
    </div>
  );
}

/** S13 card: fetches GET /api/admin/brief for the dashboard's scope (the API caches it for 1 hour). */
export function AdminBriefCard({ department, className }: { department: string | null; className?: string }) {
  const t = useTranslations("brief");
  const q = useQuery({
    queryKey: ["admin-brief", department],
    queryFn: ({ signal }) => apiFetch<BriefData>(`/api/admin/brief${department ? `?department=${department}` : ""}`, { signal }),
    staleTime: 10 * 60 * 1000,
    retry: (count, e) => !(e instanceof ApiError && (e.code === "AI_UNAVAILABLE" || e.status < 500)) && count < 1,
  });

  return (
    <Card className={cn("flex flex-col", className)} aria-busy={q.isPending}>
      <Header subtitle={department ? t("subtitleDept") : t("subtitleAll")} />
      {q.isPending ? (
        <div className="mt-5 space-y-4" aria-label={t("loading")}>
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex gap-3">
              <Skeleton className="h-4 w-4 rounded" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-2/3" />
              </div>
            </div>
          ))}
          <p className="text-xs text-muted-foreground">{t("loading")}</p>
        </div>
      ) : q.isError ? (
        isApiError(q.error, "AI_UNAVAILABLE") ? (
          <EmptyState bare className="py-8" icon={CloudOff} title={t("unavailableTitle")} body={t("unavailableBody")} />
        ) : (
          <ErrorState bare className="py-8" title={t("errorTitle")} body={t("errorBody")} onRetry={() => void q.refetch()} retrying={q.isFetching} />
        )
      ) : (
        <BriefView brief={q.data} note={t("noteAdmin")} />
      )}
    </Card>
  );
}

/** Home page aside: the cached all-departments brief, aggregates only. Rendered only when one exists. */
export function CampusBriefCard({ brief }: { brief: BriefData }) {
  const t = useTranslations("brief");
  return (
    <Card className="p-6">
      <Header subtitle={t("subtitlePublic")} />
      <BriefView brief={brief} note={t("notePublic")} />
    </Card>
  );
}
