"use client";
import { useEffect, useMemo, useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/components/api-client";
import { Button, EmptyState, ErrorState, Input, Select, Skeleton } from "@/components/ui";
import { AI_PURPOSES } from "@/lib/ai/types";
import type { LogItem } from "@/lib/sys";
import { cn } from "@/lib/utils";
import { StatusText, useFmt } from "./shared";

const STATUSES = ["ok", "rate_limited", "error", "timeout", "invalid", "skipped", "fallback"] as const;
const PURPOSES = [...AI_PURPOSES, "key_test"];

type Filters = { purpose: string; status: string; provider: string; model: string; key: string; from: string; to: string };
const EMPTY: Filters = { purpose: "", status: "", provider: "", model: "", key: "", from: "", to: "" };
type Page = { items: LogItem[]; nextCursor: number | null };

/** Debounce free-text filters so typing doesn't fire a request per key. */
function useDebounced<T>(value: T, ms = 350) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setV(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return v;
}

// S23 — AI logs: filters, newest first, keyset "Load more", failover chains grouped + highlighted.
export function SysLogs() {
  const t = useTranslations("sys.logs");
  const tc = useTranslations("sys.common");
  const ts = useTranslations("sys.status");
  const f = useFmt();
  const [filters, setFilters] = useState<Filters>(EMPTY);
  const applied = useDebounced(filters);
  const set = (k: keyof Filters) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setFilters((s) => ({ ...s, [k]: e.target.value }));

  const q = useInfiniteQuery({
    queryKey: ["sys", "logs", applied],
    initialPageParam: null as number | null,
    queryFn: ({ pageParam }) => {
      const sp = new URLSearchParams(Object.entries(applied).filter(([, v]) => v));
      if (pageParam) sp.set("cursor", String(pageParam));
      return apiFetch<Page>(`/api/sys/logs?${sp}`);
    },
    getNextPageParam: (last) => last.nextCursor,
    staleTime: 0,
  });
  const items = useMemo(() => q.data?.pages.flatMap((p) => p.items) ?? [], [q.data]);
  const all = { value: "", label: t("all") };
  const chainSize = useMemo(() => {
    const m = new Map<number, number>();
    for (const r of items) if (r.chain !== null) m.set(r.chain, (m.get(r.chain) ?? 0) + 1);
    return m;
  }, [items]);

  return (
    <div className="space-y-5">
      <fieldset className="grid gap-3 rounded-card border border-border bg-surface p-4 sm:grid-cols-2 lg:grid-cols-4">
        <legend className="sr-only">{t("filters")}</legend>
        <Select label={t("purpose")} value={filters.purpose} onChange={set("purpose")} options={[all, ...PURPOSES.map((p) => ({ value: p, label: p }))]} />
        <Select label={t("status")} value={filters.status} onChange={set("status")} options={[all, ...STATUSES.map((s) => ({ value: s, label: ts(s) }))]} />
        <Select label={t("provider")} value={filters.provider} onChange={set("provider")} options={[all, { value: "google", label: "google" }, { value: "openrouter", label: "openrouter" }]} />
        <Input label={t("model")} value={filters.model} onChange={set("model")} maxLength={120} autoComplete="off" />
        <Input label={t("key")} value={filters.key} onChange={set("key")} maxLength={80} autoComplete="off" />
        <Input label={t("from")} type="date" value={filters.from} onChange={set("from")} />
        <Input label={t("to")} type="date" value={filters.to} onChange={set("to")} />
        <div className="flex items-end">
          <Button variant="ghost" onClick={() => setFilters(EMPTY)} disabled={Object.values(filters).every((v) => !v)}>{t("clear")}</Button>
        </div>
      </fieldset>

      {q.isPending ? (
        <div className="space-y-2" aria-busy>{Array.from({ length: 8 }, (_, i) => <Skeleton key={i} className="h-12 rounded-xl" />)}</div>
      ) : q.isError ? (
        <ErrorState body={tc("loadError")} onRetry={() => q.refetch()} retrying={q.isFetching} />
      ) : items.length === 0 ? (
        <EmptyState title={t("empty")} />
      ) : (
        <>
          <ol className="overflow-hidden rounded-card border border-border bg-surface">
            <li aria-hidden className="hidden grid-cols-[9rem_7rem_1fr_8rem_7rem_5rem] gap-3 border-b border-border px-4 py-3 text-xs font-medium text-muted-foreground lg:grid">
              <span>{t("time")}</span><span>{t("purpose")}</span><span>{t("model")}</span><span>{t("key")}</span><span>{t("status")}</span><span className="text-right">{t("latency")}</span>
            </li>
            {items.map((r, i) => {
              const inChain = r.chain !== null;
              const startsChain = inChain && items[i - 1]?.chain !== r.chain;
              return (
                <li
                  key={r.id}
                  className={cn(
                    "border-b border-border last:border-b-0",
                    inChain && "border-l-2 border-l-warning bg-warning-soft/40",
                  )}
                >
                  {startsChain && (
                    <p className="px-4 pt-2.5 text-xs font-medium text-warning">
                      {t("chain")} · {t("chainFinal", { n: f.n((chainSize.get(r.chain!) ?? 1) - 1) })}
                    </p>
                  )}
                  <div className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-0.5 px-4 py-2.5 text-sm lg:grid-cols-[9rem_7rem_1fr_8rem_7rem_5rem] lg:items-baseline">
                    <time dateTime={r.created_at} className="text-xs text-muted-foreground lg:text-sm">{f.dateTime(r.created_at)}</time>
                    <span className="text-right font-mono text-xs lg:text-left lg:text-[0.8125rem]">{r.purpose}</span>
                    <span className="col-span-2 min-w-0 font-mono text-[0.8125rem] break-all lg:col-span-1">{r.provider ? `${r.provider}/` : ""}{r.model ?? tc("dash")}</span>
                    <span className="min-w-0 truncate text-muted-foreground">{r.key_label ?? tc("dash")}</span>
                    <StatusText status={r.status} className="text-right lg:text-left" />
                    <span className="tabular col-span-2 text-xs text-muted-foreground lg:col-span-1 lg:text-right lg:text-sm">{f.ms(r.latency_ms)}</span>
                    {r.error && <p className="col-span-2 text-xs break-words text-muted-foreground lg:col-span-6">{r.error}</p>}
                  </div>
                </li>
              );
            })}
          </ol>
          <div className="flex justify-center">
            {q.hasNextPage ? (
              <Button variant="secondary" onClick={() => q.fetchNextPage()} loading={q.isFetchingNextPage}>{t("loadMore")}</Button>
            ) : (
              <p className="text-xs text-muted-foreground">{t("end")}</p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
