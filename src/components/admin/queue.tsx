"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { Inbox, MapPin, Search, SearchX, UserRound } from "lucide-react";
import { CATEGORIES, STATUSES, type ComplaintListItem, type ComplaintListPage, type NamedRef } from "@/lib/domain";
import { cn, toLocaleDigits } from "@/lib/utils";
import {
  Button, CategoryChip, EmptyState, ErrorState, LangText, PriorityChip, Select, Skeleton, StatusChip, buttonVariants,
} from "@/components/ui";
import { apiFetch } from "@/components/api-client";
import { useRealtime } from "@/components/use-realtime";
import { SlaCountdown } from "@/components/ticket/sla-countdown";

const FILTER_KEYS = ["status", "priority", "category", "department", "lang", "q"] as const;
type Filters = Record<(typeof FILTER_KEYS)[number], string>;

/** status filter values: "active" (default, open statuses), "all", or one status. */
function readFilters(sp: URLSearchParams): Filters {
  const f = Object.fromEntries(FILTER_KEYS.map((k) => [k, sp.get(k) ?? ""])) as Filters;
  if (!f.status) f.status = "active";
  return f;
}

function RowSkeleton() {
  return (
    <div className="flex items-center gap-4 px-5 py-4" aria-hidden>
      <Skeleton className="h-4 w-20" />
      <Skeleton className="h-4 flex-1" />
      <Skeleton className="h-6 w-20 rounded-full" />
      <Skeleton className="hidden h-6 w-24 rounded-full md:block" />
    </div>
  );
}

function LangFlag({ lang }: { lang: "en" | "as" | null }) {
  const t = useTranslations("queue");
  if (!lang) return null;
  return (
    <span title={lang === "as" ? t("langAs") : t("langEn")} className="inline-grid h-6 min-w-8 place-items-center rounded-md border border-border px-1.5 text-[11px] font-semibold text-muted-foreground">
      {lang === "as" ? t("flagAs") : t("flagEn")}
    </span>
  );
}

/** S14 — triage queue. Filters live in the URL; rows refresh live when tickets of the department change. */
export function QueueView({ isSuper, departmentId, departments }: { isSuper: boolean; departmentId: string | null; departments: NamedRef[] }) {
  const t = useTranslations("queue");
  const ta = useTranslations("assign");
  const ts = useTranslations("status");
  const tc = useTranslations("category");
  const tp = useTranslations("priority");
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const qc = useQueryClient();
  const filters = useMemo(() => readFilters(new URLSearchParams(sp.toString())), [sp]);
  const [search, setSearch] = useState(filters.q);

  const setFilter = (patch: Partial<Filters>) => {
    const next = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (!v || (k === "status" && v === "active")) next.delete(k);
      else next.set(k, v);
    }
    const s = next.toString();
    router.replace(s ? `${pathname}?${s}` : pathname, { scroll: false });
  };

  // Debounced search → URL.
  const latest = useRef(filters.q);
  useEffect(() => {
    latest.current = filters.q;
  }, [filters.q]);
  useEffect(() => {
    const id = setTimeout(() => {
      if (search.trim() !== latest.current) setFilter({ q: search.trim() });
    }, 350);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only react to typing
  }, [search]);

  const query = useInfiniteQuery({
    queryKey: ["complaints", "dept", filters],
    queryFn: ({ pageParam, signal }) => {
      const p = new URLSearchParams({ scope: "dept", status: filters.status });
      for (const k of ["priority", "category", "lang", "q"] as const) if (filters[k]) p.set(k, filters[k]);
      if (isSuper && filters.department) p.set("department", filters.department);
      if (pageParam) p.set("cursor", pageParam);
      return apiFetch<ComplaintListPage>(`/api/complaints?${p}`, { signal });
    },
    initialPageParam: "" as string,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });

  // Realtime follows RLS (admins receive their department's rows). Bursts are coalesced into one refetch.
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useRealtime(
    "admin-queue",
    [{ table: "complaints", ...(departmentId && !isSuper ? { filter: `department_id=eq.${departmentId}` } : {}) }],
    () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void qc.invalidateQueries({ queryKey: ["complaints", "dept"] }), 600);
    },
  );
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const items = query.data?.pages.flatMap((p) => p.items) ?? [];
  const filtered = FILTER_KEYS.some((k) => (k === "status" ? filters.status !== "active" : Boolean(filters[k])));
  const reviewOnly = filters.status === "needs_review";

  const statusOptions = [
    { value: "active", label: t("statusActive") },
    { value: "all", label: t("statusAll") },
    ...STATUSES.map((s) => ({ value: s, label: ts(s) })),
  ];

  const reporter = (i: ComplaintListItem) =>
    i.anonymous ? <span className="text-muted-foreground italic">{t("anonymous")}</span> : (i.reporter_name ?? <span className="text-muted-foreground">—</span>);
  const assignee = (i: ComplaintListItem) =>
    i.assigned ? (
      <>
        {i.assignee_name ?? t("assignedNoName")}
        {i.auto_assigned && (
          <span
            title={ta("autoTitle")}
            className="ml-1.5 inline-flex h-5 items-center rounded-full border border-border px-1.5 align-middle text-[0.6875rem] font-medium text-muted-foreground"
          >
            {ta("autoShort")}
          </span>
        )}
      </>
    ) : (
      <span className="text-muted-foreground">{t("unassigned")}</span>
    );

  return (
    <div className="mx-auto max-w-[84rem]">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-display text-[2.25rem] sm:text-[2.75rem]">{t("title")}</h1>
          <p className="mt-2 text-muted-foreground">{t("subtitle")}</p>
        </div>
        <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-success">
          <span className="relative flex size-2">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-success opacity-50 motion-reduce:hidden" />
            <span className="relative inline-flex size-2 rounded-full bg-success" />
          </span>
          {t("live")}
        </span>
      </header>

      {/* Filters */}
      <section aria-label={t("filters")} className="mt-6 rounded-card border border-border bg-surface p-4 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
          <label className="flex h-11 min-w-0 flex-1 items-center gap-2.5 rounded-field border border-border bg-surface px-3.5 text-sm focus-within:border-foreground/40">
            <Search className="size-4 shrink-0 text-subtle-foreground" strokeWidth={1.75} aria-hidden />
            <span className="sr-only">{t("search")}</span>
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("search")}
              className="min-w-0 flex-1 bg-transparent outline-none"
            />
          </label>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:flex lg:flex-none">
            <Select
              aria-label={t("status")}
              value={filters.status}
              onChange={(e) => setFilter({ status: e.target.value })}
              options={statusOptions}
              fieldClassName="lg:w-40"
            />
            <Select
              aria-label={t("priority")}
              value={filters.priority}
              onChange={(e) => setFilter({ priority: e.target.value })}
              placeholder={t("anyPriority")}
              options={[1, 2, 3, 4].map((p) => ({ value: String(p), label: `P${toLocaleDigits(p, locale)} · ${tp(String(p))}` }))}
              fieldClassName="lg:w-36"
            />
            <Select
              aria-label={t("category")}
              value={filters.category}
              onChange={(e) => setFilter({ category: e.target.value })}
              placeholder={t("anyCategory")}
              options={CATEGORIES.map((c) => ({ value: c, label: tc(c) }))}
              fieldClassName="lg:w-40"
            />
            <Select
              aria-label={t("language")}
              value={filters.lang}
              onChange={(e) => setFilter({ lang: e.target.value })}
              placeholder={t("anyLanguage")}
              options={[
                { value: "as", label: t("langAs") },
                { value: "en", label: t("langEn") },
              ]}
              fieldClassName="lg:w-36"
            />
            {isSuper && (
              <Select
                aria-label={t("department")}
                value={filters.department}
                onChange={(e) => setFilter({ department: e.target.value })}
                placeholder={t("anyDepartment")}
                options={departments.map((d) => ({ value: d.id, label: locale === "as" ? d.name_as : d.name_en }))}
                fieldClassName="lg:w-48"
              />
            )}
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            aria-pressed={reviewOnly}
            onClick={() => setFilter({ status: reviewOnly ? "active" : "needs_review" })}
            className={cn(
              "rounded-full border px-3.5 py-1.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              reviewOnly ? "border-foreground bg-primary text-primary-foreground" : "border-border text-muted-foreground hover:text-foreground",
            )}
          >
            {t("needsReviewOnly")}
          </button>
          {filtered && (
            <button
              type="button"
              onClick={() => {
                setSearch("");
                router.replace(pathname, { scroll: false });
              }}
              className="rounded-full px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground"
            >
              {t("clear")}
            </button>
          )}
        </div>
      </section>

      {/* Results */}
      <section className="mt-5" aria-busy={query.isPending} aria-live="polite">
        {query.isPending ? (
          <div className="divide-y divide-border rounded-card border border-border bg-surface shadow-sm">
            <span className="sr-only">{t("loading")}</span>
            {Array.from({ length: 6 }, (_, i) => <RowSkeleton key={i} />)}
          </div>
        ) : query.isError ? (
          <ErrorState onRetry={() => void query.refetch()} retrying={query.isFetching} />
        ) : items.length === 0 ? (
          <EmptyState
            icon={filtered ? SearchX : Inbox}
            title={filtered ? t("emptyFilteredTitle") : t("emptyTitle")}
            body={filtered ? t("emptyFilteredBody") : t("emptyBody")}
            action={
              filtered ? (
                <button type="button" className={buttonVariants({ variant: "secondary" })} onClick={() => { setSearch(""); router.replace(pathname, { scroll: false }); }}>
                  {t("clear")}
                </button>
              ) : undefined
            }
          />
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden overflow-hidden rounded-card border border-border bg-surface shadow-sm md:block">
              <div className="max-h-[70dvh] overflow-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 z-10 bg-surface">
                    <tr className="border-b border-border text-left text-xs text-muted-foreground">
                      {["code", "titleCol", "category", "priority", "status", "location", "language", "reporter", "sla", "assignee"].map((k) => (
                        <th key={k} scope="col" className="px-4 py-3 font-medium whitespace-nowrap first:pl-5 last:pr-5">
                          {k === "language" ? <span className="sr-only">{t(k)}</span> : t(k)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {items.map((i) => (
                      <tr
                        key={i.id}
                        onClick={() => router.push(`/admin/t/${i.id}`)}
                        className="cursor-pointer align-middle transition-colors hover:bg-surface-muted/60"
                      >
                        <td className="py-3 pr-4 pl-5 font-mono text-xs font-semibold tracking-wider whitespace-nowrap">
                          <Link href={`/admin/t/${i.id}`} onClick={(e) => e.stopPropagation()} className="hover:underline">
                            {i.code}
                          </Link>
                        </td>
                        <td className="max-w-[18rem] px-4 py-3">
                          <LangText en={i.title_en} as={i.title_as} fallback={i.code} className="line-clamp-2 font-medium" />
                        </td>
                        <td className="px-4 py-3"><CategoryChip category={i.category} /></td>
                        <td className="px-4 py-3"><PriorityChip priority={i.priority} /></td>
                        <td className="px-4 py-3"><StatusChip status={i.status} /></td>
                        <td className="max-w-[10rem] truncate px-4 py-3 text-muted-foreground">
                          {i.location ? <LangText en={i.location.name_en} as={i.location.name_as} /> : "—"}
                        </td>
                        <td className="px-4 py-3"><LangFlag lang={i.original_lang} /></td>
                        <td className="max-w-[9rem] truncate px-4 py-3">{reporter(i)}</td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <SlaCountdown due={i.sla_due_at} status={i.status} />
                        </td>
                        <td className="max-w-[9rem] truncate py-3 pr-5 pl-4">{assignee(i)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Mobile cards */}
            <ul className="space-y-3 md:hidden">
              {items.map((i) => (
                <li key={i.id}>
                  <Link href={`/admin/t/${i.id}`} className="block rounded-card border border-border bg-surface p-4 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs font-semibold tracking-wider text-muted-foreground">{i.code}</span>
                      <StatusChip status={i.status} />
                      <PriorityChip priority={i.priority} />
                      <LangFlag lang={i.original_lang} />
                    </div>
                    <LangText tag="p" en={i.title_en} as={i.title_as} fallback={i.code} className="mt-2.5 font-semibold" />
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        <MapPin className="size-3.5" strokeWidth={1.75} aria-hidden />
                        {i.location ? <LangText en={i.location.name_en} as={i.location.name_as} /> : "—"}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <UserRound className="size-3.5" strokeWidth={1.75} aria-hidden />
                        {assignee(i)}
                      </span>
                    </div>
                    <div className="mt-2.5 flex items-center justify-between gap-2">
                      <CategoryChip category={i.category} />
                      <SlaCountdown due={i.sla_due_at} status={i.status} />
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}
        {query.hasNextPage && (
          <div className="mt-5 text-center">
            <Button variant="secondary" onClick={() => void query.fetchNextPage()} loading={query.isFetchingNextPage}>
              {t("loadMore")}
            </Button>
          </div>
        )}
      </section>
    </div>
  );
}
