"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { CheckCircle2, ClipboardCheck, MapPin, Play } from "lucide-react";
import type { ComplaintListItem, ComplaintListPage, ComplaintUpdateResult } from "@/lib/domain";
import {
  Button, CategoryChip, EmptyState, ErrorState, LangText, LifecycleTrack, PriorityChip, Skeleton, StatusChip, Tabs,
} from "@/components/ui";
import { apiFetch, isApiError } from "@/components/api-client";
import { useRealtime } from "@/components/use-realtime";
import { SlaCountdown } from "@/components/ticket/sla-countdown";
import { ResolveDrawer } from "./resolve-drawer";

type Tab = "todo" | "done";
const TAB_STATUS: Record<Tab, string> = { todo: "assigned,in_progress", done: "resolved,closed" };

/** Soonest SLA first; tickets without an SLA go last. */
const bySla = (a: ComplaintListItem, b: ComplaintListItem) =>
  (a.sla_due_at ? Date.parse(a.sla_due_at) : Infinity) - (b.sla_due_at ? Date.parse(b.sla_due_at) : Infinity);

function CardSkeleton() {
  return (
    <div className="rounded-card border border-border bg-surface p-5 shadow-sm" aria-hidden>
      <div className="flex gap-2">
        <Skeleton className="h-6 w-20 rounded-full" />
        <Skeleton className="h-6 w-16 rounded-full" />
      </div>
      <Skeleton className="mt-4 h-5 w-4/5" />
      <Skeleton className="mt-2 h-4 w-1/2" />
      <Skeleton className="mt-5 h-10 w-full rounded-full" />
    </div>
  );
}

/** S12 — field staff work list: tickets assigned to me, soonest deadline first. */
export function StaffQueue({ userId, isAdmin }: { userId: string; isAdmin: boolean }) {
  const t = useTranslations("staff");
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>("todo");
  const [resolving, setResolving] = useState<ComplaintListItem | null>(null);
  const key = ["complaints", "assigned", tab] as const;

  const query = useInfiniteQuery({
    queryKey: key,
    queryFn: ({ pageParam, signal }) => {
      const sp = new URLSearchParams({ scope: "assigned", status: TAB_STATUS[tab] });
      if (pageParam) sp.set("cursor", pageParam);
      return apiFetch<ComplaintListPage>(`/api/complaints?${sp}`, { signal });
    },
    initialPageParam: "" as string,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });

  // New assignments and status changes arrive live (RLS: the assignee receives their rows).
  useRealtime("staff-queue", [{ table: "complaints", filter: `assignee_id=eq.${userId}` }], () => {
    void qc.invalidateQueries({ queryKey: ["complaints", "assigned"] });
  });

  const start = useMutation({
    mutationFn: (id: string) =>
      apiFetch<ComplaintUpdateResult>(`/api/complaints/${encodeURIComponent(id)}`, { method: "PATCH", json: { status: "in_progress" } }),
    onSuccess: (r) => {
      toast.success(t("started", { code: r.code }));
      void qc.invalidateQueries({ queryKey: ["complaints", "assigned"] });
    },
    onError: (e) => {
      toast.error(isApiError(e, "INVALID_TRANSITION") ? t("changed") : t("failed"));
      void qc.invalidateQueries({ queryKey: ["complaints", "assigned"] });
    },
  });

  const items = useMemo(() => (query.data?.pages.flatMap((p) => p.items) ?? []).slice().sort(bySla), [query.data]);

  return (
    <div className="mx-auto max-w-3xl">
      <header>
        <h1 className="text-display text-[2.25rem] sm:text-[2.75rem]">{t("title")}</h1>
        <p className="mt-2 text-muted-foreground">{t("subtitle")}</p>
      </header>

      <Tabs<Tab>
        className="mt-6"
        label={t("tabsLabel")}
        value={tab}
        onValueChange={setTab}
        items={[
          { value: "todo", label: t("tabTodo") },
          { value: "done", label: t("tabDone") },
        ]}
      />

      <section className="mt-5" aria-busy={query.isPending}>
        {query.isPending ? (
          <div className="space-y-4">
            <span className="sr-only">{t("loading")}</span>
            <CardSkeleton />
            <CardSkeleton />
          </div>
        ) : query.isError ? (
          <ErrorState onRetry={() => void query.refetch()} retrying={query.isFetching} />
        ) : items.length === 0 ? (
          <EmptyState
            icon={tab === "todo" ? ClipboardCheck : CheckCircle2}
            title={tab === "todo" ? t("emptyTodoTitle") : t("emptyDoneTitle")}
            body={tab === "todo" ? t("emptyTodoBody") : t("emptyDoneBody")}
          />
        ) : (
          <ul className="space-y-4">
            {items.map((i) => (
              <li key={i.id} className="rounded-card border border-border bg-surface p-5 shadow-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-xs font-semibold tracking-wider text-muted-foreground">{i.code}</span>
                  <StatusChip status={i.status} />
                  <PriorityChip priority={i.priority} />
                  <CategoryChip category={i.category} />
                </div>
                <Link href={isAdmin ? `/admin/t/${i.id}` : `/c/${i.id}`} className="mt-3 block rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <LangText tag="h2" en={i.title_en} as={i.title_as} fallback={i.code} className="text-title text-lg" />
                </Link>
                <p className="mt-1.5 flex items-center gap-1.5 text-sm text-muted-foreground">
                  <MapPin className="size-4 shrink-0" strokeWidth={1.75} aria-hidden />
                  {i.location ? <LangText en={i.location.name_en} as={i.location.name_as} /> : t("noLocation")}
                </p>
                <LifecycleTrack status={i.status} className="mt-4" />
                <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                  <SlaCountdown due={i.sla_due_at} status={i.status} className="text-sm" />
                  <div className="ml-auto flex flex-wrap gap-2">
                    {i.status === "assigned" && (
                      <Button variant="secondary" onClick={() => start.mutate(i.id)} loading={start.isPending && start.variables === i.id}>
                        {!(start.isPending && start.variables === i.id) && <Play aria-hidden />}
                        {t("start")}
                      </Button>
                    )}
                    {(i.status === "assigned" || i.status === "in_progress") && (
                      <Button onClick={() => setResolving(i)}>
                        <CheckCircle2 aria-hidden />
                        {t("resolve.open")}
                      </Button>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
        {query.hasNextPage && (
          <div className="mt-5 text-center">
            <Button variant="secondary" onClick={() => void query.fetchNextPage()} loading={query.isFetchingNextPage}>
              {t("loadMore")}
            </Button>
          </div>
        )}
      </section>

      {resolving && (
        <ResolveDrawer
          complaintId={resolving.id}
          code={resolving.code}
          open
          onOpenChange={(o) => !o && setResolving(null)}
          requirePhoto={!isAdmin}
          onDone={() => void qc.invalidateQueries({ queryKey: ["complaints", "assigned"] })}
        />
      )}
    </div>
  );
}
