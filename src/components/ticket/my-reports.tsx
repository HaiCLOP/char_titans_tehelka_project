"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useInfiniteQuery, useQueryClient, type InfiniteData } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ClipboardList, Plus, Search, SearchX } from "lucide-react";
import { STATUSES, type ComplaintListItem, type ComplaintListPage, type Status } from "@/lib/domain";
import { Button, EmptyState, ErrorState, IssueCard, IssueCardSkeleton, LifecycleTrack, Tabs, buttonVariants } from "@/components/ui";
import { apiFetch } from "@/components/api-client";
import { useRealtime } from "@/components/use-realtime";
import { SlaCountdown } from "./sla-countdown";

type Tab = "active" | "resolved" | "all";

/** Columns of a realtime `complaints` row that can be patched straight into a cached list item. */
const PATCHABLE = ["status", "priority", "category", "metoo_count", "sla_due_at", "title_en", "title_as", "updated_at", "is_urgent"] as const;

function patchItem(item: ComplaintListItem, row: Record<string, unknown>): ComplaintListItem {
  const next = { ...item } as Record<string, unknown>;
  for (const k of PATCHABLE) if (k in row && row[k] !== undefined) next[k] = row[k];
  if (typeof next.status !== "string" || !(STATUSES as readonly string[]).includes(next.status)) next.status = item.status;
  return next as ComplaintListItem;
}

export function MyReports({ userId }: { userId: string }) {
  const t = useTranslations("my");
  const qc = useQueryClient();
  const reduce = useReducedMotion();
  const [tab, setTab] = useState<Tab>("active");
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  useEffect(() => {
    const id = setTimeout(() => setQ(search.trim()), 300);
    return () => clearTimeout(id);
  }, [search]);

  const query = useInfiniteQuery({
    queryKey: ["complaints", "mine", tab, q],
    queryFn: ({ pageParam, signal }) => {
      const sp = new URLSearchParams({ scope: "mine", status: tab });
      if (q) sp.set("q", q);
      if (pageParam) sp.set("cursor", pageParam);
      return apiFetch<ComplaintListPage>(`/api/complaints?${sp}`, { signal });
    },
    initialPageParam: "" as string,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });

  // Live updates: patch the chip immediately, then refetch so items move between tabs.
  useRealtime("my-reports", [{ table: "complaints", filter: `user_id=eq.${userId}` }], (payload) => {
    const row = payload.new as Record<string, unknown> | undefined;
    if (payload.eventType === "UPDATE" && row && typeof row.id === "string") {
      qc.setQueriesData<InfiniteData<ComplaintListPage>>({ queryKey: ["complaints", "mine"] }, (data) =>
        data
          ? { ...data, pages: data.pages.map((p) => ({ ...p, items: p.items.map((i) => (i.id === row.id ? patchItem(i, row) : i)) })) }
          : data,
      );
    }
    void qc.invalidateQueries({ queryKey: ["complaints", "mine"] });
  });

  const items = query.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{t("title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>
        </div>
        <Link href="/report" className={buttonVariants({ className: "hidden sm:inline-flex" })}>
          <Plus aria-hidden />
          {t("newReport")}
        </Link>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Tabs<Tab>
          label={t("tabsLabel")}
          value={tab}
          onValueChange={setTab}
          fill
          className="sm:w-auto"
          items={[
            { value: "active", label: t("tabs.active") },
            { value: "resolved", label: t("tabs.resolved") },
            { value: "all", label: t("tabs.all") },
          ]}
        />
        <label className="flex h-10 min-w-0 items-center gap-2 rounded-full border border-border bg-surface px-4 text-sm shadow-sm focus-within:ring-2 focus-within:ring-ring sm:w-72">
          <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          <span className="sr-only">{t("search")}</span>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("search")}
            maxLength={100}
            className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-muted-foreground"
          />
        </label>
      </div>

      <div className="mt-5">
        {query.isPending ? (
          <div className="grid gap-3 md:grid-cols-2" aria-busy>
            <span className="sr-only">{t("loading")}</span>
            {Array.from({ length: 4 }, (_, i) => (
              <IssueCardSkeleton key={i} />
            ))}
          </div>
        ) : query.isError ? (
          <ErrorState onRetry={() => void query.refetch()} retrying={query.isRefetching} />
        ) : items.length === 0 ? (
          q ? (
            <EmptyState icon={SearchX} title={t("emptySearch.title")} body={t("emptySearch.body")} />
          ) : (
            <EmptyState
              icon={ClipboardList}
              title={t(`empty.${tab}.title`)}
              body={t(`empty.${tab}.body`)}
              action={
                <Link href="/report" className={buttonVariants()}>
                  <Plus aria-hidden />
                  {t("newReport")}
                </Link>
              }
            />
          )
        ) : (
          <>
            <ul className="grid gap-3 md:grid-cols-2">
              <AnimatePresence initial={false}>
                {items.map((item) => (
                  <motion.li
                    key={item.id}
                    layout={!reduce}
                    initial={reduce ? false : { opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={reduce ? undefined : { opacity: 0 }}
                  >
                    <IssueCard
                      compact
                      issue={{ ...item, photo_url: item.thumb }}
                      footer={
                        <div className="space-y-1.5 pt-1">
                          <LifecycleTrack status={item.status as Status} showLabel={false} />
                          <SlaCountdown due={item.sla_due_at} status={item.status as Status} />
                        </div>
                      }
                    />
                  </motion.li>
                ))}
              </AnimatePresence>
            </ul>
            {query.hasNextPage && (
              <div className="mt-5 flex justify-center">
                <Button variant="secondary" onClick={() => void query.fetchNextPage()} loading={query.isFetchingNextPage}>
                  {t("loadMore")}
                </Button>
              </div>
            )}
            {query.isFetchNextPageError && <p className="mt-3 text-center text-xs text-danger">{t("loadMoreFailed")}</p>}
          </>
        )}
      </div>
    </div>
  );
}
