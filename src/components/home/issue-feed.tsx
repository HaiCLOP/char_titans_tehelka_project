"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { ArrowUpDown, CheckCircle2, Clock, Inbox, RotateCcw, ThumbsUp, Zap } from "lucide-react";
import { CATEGORY_ICON, Card, EmptyState, IssueCard, LifecycleTrack, buttonVariants } from "@/components/ui";
import { CATEGORIES, type Category, type ComplaintListItem } from "@/lib/domain";
import { cn, toLocaleDigits } from "@/lib/utils";

type SortMode = "severity" | "newest" | "supported";

type IssueFeedProps = {
  issues: ComplaintListItem[];
  view: "open" | "resolved";
};

export function IssueFeed({ issues, view }: IssueFeedProps) {
  const t = useTranslations("home");
  const tc = useTranslations("category");
  const tp = useTranslations("priority");
  const locale = useLocale();

  const [category, setCategory] = useState<Category | "all">("all");
  const [priority, setPriority] = useState<number | "all">("all");
  const [sort, setSort] = useState<SortMode>("severity");

  // Category counts from loaded issues
  const catCounts = useMemo(() => {
    const counts = new Map<Category, number>();
    for (const item of issues) {
      counts.set(item.category, (counts.get(item.category) ?? 0) + 1);
    }
    return counts;
  }, [issues]);

  const presentCategories = useMemo(() => {
    return CATEGORIES.filter((c) => (catCounts.get(c) ?? 0) > 0 || c === category);
  }, [catCounts, category]);

  // Priority counts
  const prioCounts = useMemo(() => {
    const counts = new Map<number, number>();
    for (const item of issues) {
      counts.set(item.priority, (counts.get(item.priority) ?? 0) + 1);
    }
    return counts;
  }, [issues]);

  // Filter and sort items
  const filteredIssues = useMemo(() => {
    const result = issues.filter((item) => {
      if (category !== "all" && item.category !== category) return false;
      if (priority !== "all" && item.priority !== priority) return false;
      return true;
    });

    return result.sort((a, b) => {
      if (sort === "severity") {
        if (a.priority !== b.priority) return a.priority - b.priority;
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      }
      if (sort === "newest") {
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      }
      if (sort === "supported") {
        if (b.metoo_count !== a.metoo_count) return b.metoo_count - a.metoo_count;
        return a.priority - b.priority;
      }
      return 0;
    });
  }, [issues, category, priority, sort]);

  const isFiltered = category !== "all" || priority !== "all" || sort !== "severity";

  const resetFilters = () => {
    setCategory("all");
    setPriority("all");
    setSort("severity");
  };

  if (issues.length === 0) {
    return (
      <Card className="py-14">
        <EmptyState
          bare
          icon={view === "open" ? Inbox : CheckCircle2}
          title={view === "open" ? t("emptyOpenTitle") : t("emptyResolvedTitle")}
          body={view === "open" ? t("emptyOpenBody") : t("emptyResolvedBody")}
          action={
            view === "open" ? (
              <Link href="/report" className={buttonVariants({ variant: "primary" })}>
                {t("reportCta", { defaultValue: "Report a Complaint" })}
              </Link>
            ) : undefined
          }
        />
      </Card>
    );
  }

  return (
    <div className="space-y-3.5">
      {/* Category Filter Chips Bar */}
      <div
        className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:flex-wrap sm:overflow-visible sm:pb-0 [scrollbar-width:none]"
        role="group"
        aria-label="Category filters"
      >
        <button
          type="button"
          onClick={() => setCategory("all")}
          className={cn(
            "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            category === "all"
              ? "border-primary bg-primary text-primary-foreground font-semibold shadow-xs"
              : "border-border bg-surface text-foreground hover:border-border-strong",
          )}
        >
          {t("allCategories")}
          <span className="tabular text-[11px] opacity-75">{toLocaleDigits(issues.length, locale)}</span>
        </button>

        {presentCategories.map((c) => {
          const Icon = CATEGORY_ICON[c];
          const count = catCounts.get(c) ?? 0;
          return (
            <button
              key={c}
              type="button"
              onClick={() => setCategory(category === c ? "all" : c)}
              className={cn(
                "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                category === c
                  ? "border-primary bg-primary text-primary-foreground font-semibold shadow-xs"
                  : "border-border bg-surface text-foreground hover:border-border-strong",
              )}
            >
              <Icon className="size-3.5" aria-hidden />
              {tc(c)}
              <span className="tabular text-[11px] opacity-75">{toLocaleDigits(count, locale)}</span>
            </button>
          );
        })}
      </div>

      {/* Controls Bar: Priority Filter & Sort Selector */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 rounded-xl border border-border/70 bg-surface/80 p-2 sm:px-3 text-xs">
        {/* Left: Severity Filter */}
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] font-medium text-muted-foreground mr-0.5">{t("filterPriority")}:</span>
          <button
            type="button"
            onClick={() => setPriority("all")}
            className={cn(
              "rounded-lg px-2 py-1 text-[11px] font-medium transition-colors",
              priority === "all"
                ? "bg-surface-muted font-semibold text-foreground ring-1 ring-border"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t("allCategories")}
          </button>
          {[1, 2, 3, 4].map((p) => {
            const count = prioCounts.get(p) ?? 0;
            if (count === 0 && priority !== p) return null;
            return (
              <button
                key={p}
                type="button"
                onClick={() => setPriority(priority === p ? "all" : p)}
                className={cn(
                  "inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium transition-colors",
                  priority === p
                    ? "bg-surface-muted font-semibold text-foreground ring-1 ring-border"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <span className="size-2 rounded-full" style={{ backgroundColor: `var(--p${p})` }} aria-hidden />
                {tp(String(p))}
                <span className="text-[10px] opacity-70">({toLocaleDigits(count, locale)})</span>
              </button>
            );
          })}
        </div>

        {/* Right: Sort Mode & Clear Action */}
        <div className="flex items-center gap-1.5 ml-auto">
          <div className="inline-flex items-center rounded-lg bg-surface-muted/80 p-0.5 border border-border/60">
            <button
              type="button"
              onClick={() => setSort("severity")}
              title={t("sortSeverity")}
              aria-pressed={sort === "severity"}
              className={cn(
                "inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium transition-all",
                sort === "severity"
                  ? "bg-surface text-foreground shadow-xs font-semibold"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Zap className="size-3 text-warning" aria-hidden />
              <span>{t("sortSeverity")}</span>
            </button>
            <button
              type="button"
              onClick={() => setSort("newest")}
              title={t("sortNewest")}
              aria-pressed={sort === "newest"}
              className={cn(
                "inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium transition-all",
                sort === "newest"
                  ? "bg-surface text-foreground shadow-xs font-semibold"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Clock className="size-3 text-muted-foreground" aria-hidden />
              <span>{t("sortNewest")}</span>
            </button>
            <button
              type="button"
              onClick={() => setSort("supported")}
              title={t("sortSupported")}
              aria-pressed={sort === "supported"}
              className={cn(
                "inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium transition-all",
                sort === "supported"
                  ? "bg-surface text-foreground shadow-xs font-semibold"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <ThumbsUp className="size-3 text-primary" aria-hidden />
              <span>{t("sortSupported")}</span>
            </button>
          </div>

          {isFiltered && (
            <button
              type="button"
              onClick={resetFilters}
              title={t("clearFilters")}
              className="inline-flex items-center gap-1 rounded-lg border border-border bg-surface px-2 py-1 text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-surface-muted transition-colors"
            >
              <RotateCcw className="size-2.5" aria-hidden />
              <span>{t("clearFilters")}</span>
            </button>
          )}
        </div>
      </div>

      {/* Issues Grid or Filtered Empty State */}
      {filteredIssues.length === 0 ? (
        <Card className="py-10 text-center">
          <EmptyState
            bare
            icon={ArrowUpDown}
            title={t("emptyFilteredTitle")}
            body={t("emptyFilteredBody")}
            action={
              <button
                type="button"
                onClick={resetFilters}
                className={buttonVariants({ variant: "secondary", size: "sm" })}
              >
                {t("clearFilters")}
              </button>
            }
          />
        </Card>
      ) : (
        <ul className="grid gap-3.5 sm:grid-cols-2">
          {filteredIssues.map((item) => (
            <li key={item.id}>
              <IssueCard
                compact
                issue={{ ...item, photo_url: item.thumb }}
                showCategory
                footer={<LifecycleTrack status={item.status} showLabel={false} className="pt-1" />}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
