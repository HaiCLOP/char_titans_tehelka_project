"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { Building2, Check, Map as MapIcon, MapPin, MapPinOff, Search, X } from "lucide-react";
import { CATEGORY_ICON, Card, Drawer, EmptyState, IssueCard, buttonVariants } from "@/components/ui";
import { CATEGORIES, type Category, type Status } from "@/lib/domain";
import { cn, toLocaleDigits } from "@/lib/utils";

export type MapLocation = {
  id: string;
  name_en: string;
  name_as: string;
  type: string | null;
  map_x: number | null;
  map_y: number | null;
};

export type MapIssue = {
  id: string;
  code: string;
  title_en: string | null;
  title_as: string | null;
  category: Category;
  priority: number;
  status: Status;
  location_id: string | null;
  metoo_count: number;
  created_at: string;
  resolved_at: string | null;
};

type Props = {
  locations: MapLocation[];
  /** Open public issues, plus public issues fixed in the last 7 days when `includeFixed`. */
  issues: MapIssue[];
  category: Category | null;
  includeFixed: boolean;
};

type Place = {
  id: string;
  /** null = issues without a building. */
  location: MapLocation | null;
  open: MapIssue[];
  fixed: MapIssue[];
  /** Highest open priority (1 = critical), or null when nothing is open. */
  top: number | null;
};

const NONE = "__none__";
const ICON = { strokeWidth: 1.75, "aria-hidden": true } as const;
const isFixed = (s: Status) => s === "resolved" || s === "closed";

/** Circle diameter in px at sm+ (mobile renders at 80 %). */
function diameter(n: number) {
  return n === 0 ? 12 : Math.min(64, Math.round(26 + 8 * Math.sqrt(n)));
}

function href(category: Category | null, fixed: boolean) {
  const q = new URLSearchParams();
  if (category) q.set("category", category);
  if (fixed) q.set("fixed", "1");
  const s = q.toString();
  return s ? `/map?${s}` : "/map";
}

/** Groups the (category-filtered) issues by building; issues without a building go to `none`. */
function groupPlaces(locations: MapLocation[], issues: MapIssue[], category: Category | null) {
  const open = new Map<string, MapIssue[]>();
  const fixed = new Map<string, MapIssue[]>();
  const known = new Set(locations.map((l) => l.id));
  for (const i of issues) {
    if (category && i.category !== category) continue;
    const key = i.location_id && known.has(i.location_id) ? i.location_id : NONE;
    const bucket = isFixed(i.status) ? fixed : open;
    bucket.set(key, [...(bucket.get(key) ?? []), i]);
  }
  const place = (id: string, location: MapLocation | null): Place => {
    const o = open.get(id) ?? [];
    return { id, location, open: o, fixed: fixed.get(id) ?? [], top: o.length ? Math.min(...o.map((i) => i.priority)) : null };
  };
  return { list: locations.map((l) => place(l.id, l)), none: place(NONE, null) };
}

/**
 * S11 — schematic campus plan (not to scale) drawn from `locations.map_x/map_y`, plus an accessible,
 * sortable building list. Tapping a building opens its issues in a Drawer (bottom sheet on mobile).
 */
export function CampusMap({ locations, issues, category, includeFixed }: Props) {
  const t = useTranslations("map");
  const tc = useTranslations("category");
  const tp = useTranslations("priority");
  const locale = useLocale();
  const n = (v: number) => toLocaleDigits(v, locale);
  const name = (l: MapLocation | null) => (l ? (locale === "as" ? l.name_as || l.name_en : l.name_en) : t("noBuilding"));

  const [selected, setSelected] = useState<string | null>(null);
  const [sort, setSort] = useState<"count" | "name">("count");
  const [searchQuery, setSearchQuery] = useState("");
  const [mobileTab, setMobileTab] = useState<"map" | "list">("map");

  // Category counts ignore the category filter so the chips always show what is there.
  const catCounts = useMemo(() => {
    const m = new Map<Category, number>();
    for (const i of issues) m.set(i.category, (m.get(i.category) ?? 0) + 1);
    return m;
  }, [issues]);

  const places = useMemo(() => groupPlaces(locations, issues, category), [locations, issues, category]);

  const total = places.list.reduce((s, p) => s + p.open.length + p.fixed.length, 0) + places.none.open.length + places.none.fixed.length;
  const plotted = places.list.filter((p) => p.location?.map_x != null && p.location?.map_y != null);
  // Stretch the plotted positions to the plan's bounding box with safe padding so pins never clip outside card edges
  const xs = plotted.map((p) => p.location!.map_x!);
  const ys = plotted.map((p) => p.location!.map_y!);
  const fit = (v: number, vals: number[]) => {
    if (vals.length <= 1) return 0.5;
    const lo = Math.min(...vals);
    const span = Math.max(...vals) - lo;
    if (span <= 0) return 0.5;
    // Map to 10%..90% safe range so outer pins with -translate-x-1/2 never clip against overflow-hidden card borders
    return 0.10 + 0.80 * ((v - lo) / span);
  };

  const sorted = useMemo(() => {
    let rows = [...places.list, ...(places.none.open.length + places.none.fixed.length ? [places.none] : [])];
    const q = searchQuery.toLowerCase().trim();
    if (q) {
      rows = rows.filter((p) => {
        const en = (p.location?.name_en ?? "").toLowerCase();
        const as = (p.location?.name_as ?? "").toLowerCase();
        const display = name(p.location).toLowerCase();
        return en.includes(q) || as.includes(q) || display.includes(q);
      });
    }
    const coll = new Intl.Collator(locale === "as" ? "as" : "en");
    return rows.sort((a, b) =>
      sort === "name"
        ? coll.compare(name(a.location), name(b.location))
        : b.open.length - a.open.length || b.fixed.length - a.fixed.length || coll.compare(name(a.location), name(b.location)),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `name` only depends on locale
  }, [places, sort, locale, searchQuery]);

  const current = selected === NONE ? places.none : places.list.find((p) => p.id === selected) ?? null;
  const ringColor = (p: Place) => (p.top !== null ? `var(--p${p.top})` : p.fixed.length ? "var(--success)" : "var(--border-strong)");
  const countLabel = (p: Place) =>
    [t("openCount", { count: p.open.length, n: n(p.open.length) }), p.fixed.length ? t("fixedCount", { n: n(p.fixed.length) }) : null].filter(Boolean).join(" · ");

  const chip = (active: boolean) =>
    cn(
      "inline-flex h-8 sm:h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 sm:px-3.5 text-xs sm:text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
      active ? "border-primary bg-primary text-primary-foreground font-semibold" : "border-border bg-surface text-foreground hover:border-border-strong",
    );

  const presentCats = CATEGORIES.filter((c) => catCounts.has(c) || c === category);

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Category Filter Chips Bar */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:flex-wrap sm:overflow-visible sm:pb-0 [scrollbar-width:none]" role="group" aria-label={t("filterLabel")}>
        <Link href={href(null, includeFixed)} scroll={false} aria-current={category === null ? "true" : undefined} className={chip(category === null)}>
          {t("allCategories")}
          <span className="tabular text-xs opacity-70">{n(issues.length)}</span>
        </Link>
        {presentCats.map((c) => {
          const Icon = CATEGORY_ICON[c];
          return (
            <Link key={c} href={href(c, includeFixed)} scroll={false} aria-current={category === c ? "true" : undefined} className={chip(category === c)}>
              <Icon className="size-3.5 sm:size-4" {...ICON} />
              {tc(c)}
              <span className="tabular text-xs opacity-70">{n(catCounts.get(c) ?? 0)}</span>
            </Link>
          );
        })}
        <span className="mx-1 hidden h-6 w-px bg-border sm:block" aria-hidden />
        <Link href={href(category, !includeFixed)} scroll={false} aria-current={includeFixed ? "true" : undefined} className={chip(includeFixed)}>
          <span className={cn("grid size-4 place-items-center rounded-[5px] border", includeFixed ? "border-primary-foreground" : "border-border-strong")} aria-hidden>
            {includeFixed && <Check className="size-3" strokeWidth={2.5} />}
          </span>
          {t("includeFixed")}
        </Link>
      </div>

      {/* Mobile Segmented Switch: Map vs Buildings List */}
      <div className="flex xl:hidden rounded-full border border-border bg-surface-muted/80 p-1" role="tablist" aria-label={t("filterLabel")}>
        <button
          type="button"
          role="tab"
          aria-selected={mobileTab === "map"}
          onClick={() => setMobileTab("map")}
          className={cn(
            "flex-1 rounded-full py-2 text-xs font-semibold transition-all flex items-center justify-center gap-1.5",
            mobileTab === "map" ? "bg-surface text-foreground shadow-xs ring-1 ring-border font-bold" : "text-muted-foreground hover:text-foreground"
          )}
        >
          <MapIcon className="size-3.5" aria-hidden />
          {t("tabMap")}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mobileTab === "list"}
          onClick={() => setMobileTab("list")}
          className={cn(
            "flex-1 rounded-full py-2 text-xs font-semibold transition-all flex items-center justify-center gap-1.5",
            mobileTab === "list" ? "bg-surface text-foreground shadow-xs ring-1 ring-border font-bold" : "text-muted-foreground hover:text-foreground"
          )}
        >
          <Building2 className="size-3.5" aria-hidden />
          {t("tabBuildings")}
          <span className="tabular text-[10px] opacity-75">({n(sorted.length)})</span>
        </button>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        {/* Schematic Campus Plan */}
        <Card className={cn("overflow-hidden p-0", mobileTab === "list" && "hidden xl:block")}>
          <div className="relative aspect-[4/3] bg-surface-muted/40 sm:aspect-[16/10] lg:aspect-[16/11]">
            <svg className="absolute inset-0 size-full text-border/70" aria-hidden>
              <defs>
                <pattern id="cs-campus-grid" width="28" height="28" patternUnits="userSpaceOnUse">
                  <path d="M28 0H0V28" fill="none" stroke="currentColor" strokeWidth="1" />
                </pattern>
              </defs>
              <rect width="100%" height="100%" fill="url(#cs-campus-grid)" />
            </svg>
            <div className="absolute inset-x-4 top-4 bottom-12 sm:inset-x-12 sm:top-8 sm:bottom-16" role="group" aria-label={t("planLabel")}>
              {plotted.map((p) => {
                const count = p.open.length + p.fixed.length;
                const d = diameter(count);
                const on = selected === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setSelected(p.id)}
                    aria-label={`${name(p.location)}: ${countLabel(p)}`}
                    aria-haspopup="dialog"
                    style={{ left: `${fit(p.location!.map_x!, xs) * 100}%`, top: `${fit(p.location!.map_y!, ys) * 100}%`, ["--d" as string]: d }}
                    className={cn(
                      "group absolute flex w-20 sm:w-24 -translate-x-1/2 -translate-y-[calc(var(--d)*0.4px)] sm:-translate-y-[calc(var(--d)*0.5px)] flex-col items-center rounded-2xl transition-all focus-visible:outline-none touch-manipulation",
                      count > 0 ? "z-10" : "z-0",
                      on && "z-30 scale-105",
                    )}
                  >
                    <span
                      className={cn(
                        "relative grid size-[calc(var(--d)*0.8px)] place-items-center rounded-full bg-surface text-xs font-semibold tabular shadow-xs transition-all duration-200 group-hover:scale-110 group-focus-visible:ring-2 group-focus-visible:ring-ring group-focus-visible:ring-offset-2 group-focus-visible:ring-offset-surface sm:size-[calc(var(--d)*1px)] sm:text-sm",
                        count > 0 ? "border-[3px]" : "border-2",
                        on ? "ring-4 ring-primary ring-offset-2 ring-offset-surface shadow-md scale-110" : "",
                      )}
                      style={{ borderColor: ringColor(p) }}
                    >
                      {count > 0 && n(count)}
                    </span>
                    <span
                      lang={locale}
                      title={name(p.location)}
                      className={cn(
                        "mt-1 max-w-full truncate text-center text-[10px] leading-tight transition-colors sm:text-xs px-1",
                        on ? "font-bold text-primary underline underline-offset-2" : count > 0 ? "font-medium text-foreground group-hover:text-primary" : "text-muted-foreground",
                      )}
                    >
                      {name(p.location)}
                    </span>
                  </button>
                );
              })}
            </div>
            <p className="absolute bottom-2.5 left-3 sm:bottom-3 sm:left-4 rounded-full bg-surface/90 px-2.5 py-0.5 text-[10px] sm:text-[11px] text-muted-foreground ring-1 ring-border shadow-xs">{t("schematic")}</p>
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-border px-3.5 py-2.5 sm:px-5 sm:py-3.5 text-[11px] sm:text-xs text-muted-foreground">
            {[1, 2, 3, 4].map((p) => (
              <span key={p} className="inline-flex items-center gap-1.5">
                <span className="size-2.5 sm:size-3 rounded-full border-[2.5px] bg-surface" style={{ borderColor: `var(--p${p})` }} aria-hidden />
                {tp(String(p))}
              </span>
            ))}
            {includeFixed && (
              <span key="fixed" className="inline-flex items-center gap-1.5">
                <span className="size-2.5 sm:size-3 rounded-full border-[2.5px] border-success bg-surface" aria-hidden />
                {t("legendFixed")}
              </span>
            )}
            <span className="inline-flex items-center gap-1.5">
              <span className="size-2 sm:size-2.5 rounded-full border-2 border-border-strong bg-surface" aria-hidden />
              {t("legendNone")}
            </span>
            <span className="w-full sm:ml-auto sm:w-auto text-[10px] sm:text-[11px]">{t("legendSize")}</span>
          </div>
        </Card>

        {/* Buildings Directory */}
        <Card className={cn("self-start p-0", mobileTab === "map" && "hidden xl:block")}>
          <div className="flex items-center justify-between gap-3 px-4 pt-4 sm:px-5 sm:pt-5">
            <h2 className="text-base sm:text-lg font-bold tracking-tight text-foreground">{t("buildings")}</h2>
            <div role="group" aria-label={t("sortLabel")} className="inline-flex rounded-full bg-surface-muted/80 p-0.5 sm:p-1 border border-border/60">
              {(["count", "name"] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  aria-pressed={sort === s}
                  onClick={() => setSort(s)}
                  className={cn(
                    "h-7 sm:h-8 rounded-full px-2.5 sm:px-3 text-[11px] sm:text-xs font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    sort === s ? "bg-surface text-foreground shadow-xs ring-1 ring-border font-semibold" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {s === "count" ? t("sortCount") : t("sortName")}
                </button>
              ))}
            </div>
          </div>

          <div className="px-4 pt-3 sm:px-5">
            <div className="relative flex items-center">
              <Search className="pointer-events-none absolute left-3 size-3.5 text-muted-foreground" aria-hidden />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t("searchPlaceholder")}
                className="h-9 w-full rounded-full border border-border bg-surface-muted/60 pl-8 pr-8 text-xs text-foreground placeholder:text-muted-foreground transition-colors focus:border-border-strong focus:bg-surface focus:outline-none focus:ring-1 focus:ring-ring"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2.5 grid size-4 place-items-center rounded-full text-muted-foreground hover:text-foreground"
                >
                  <X className="size-3" aria-hidden />
                </button>
              )}
            </div>
          </div>

          {total === 0 && (
            <EmptyState
              bare
              className="py-8"
              title={category ? t("emptyFilteredTitle") : t("emptyTitle")}
              body={category ? t("emptyFilteredBody") : t("emptyBody")}
              action={
                category ? (
                  <Link href={href(null, includeFixed)} className={buttonVariants({ variant: "secondary" })}>{t("clearFilter")}</Link>
                ) : (
                  <Link href="/report" className={buttonVariants({ variant: "primary" })}>{t("reportCta")}</Link>
                )
              }
            />
          )}

          {sorted.length === 0 ? (
            <p className="px-5 py-6 text-sm text-muted-foreground">{searchQuery ? t("searchEmpty") : t("noBuildings")}</p>
          ) : (
            <ul className="mt-3 divide-y divide-border border-t border-border">
              {sorted.map((p) => {
                const count = p.open.length + p.fixed.length;
                const on = selected === p.id;
                return (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => setSelected(p.id)}
                      aria-haspopup="dialog"
                      className={cn(
                        "flex w-full items-center gap-2.5 sm:gap-3 px-4 sm:px-5 py-3 text-left transition-colors hover:bg-surface-muted focus-visible:bg-surface-muted focus-visible:outline-none",
                        on && "bg-surface-muted font-medium",
                      )}
                    >
                      {p.location ? (
                        <span className="size-3 shrink-0 rounded-full border-[2.5px] bg-surface" style={{ borderColor: ringColor(p) }} aria-hidden />
                      ) : (
                        <MapPinOff className="size-3.5 shrink-0 text-muted-foreground" {...ICON} />
                      )}
                      <span className="min-w-0 flex-1">
                        <span lang={locale} className={cn("block truncate text-sm", count ? "font-medium" : "text-muted-foreground")}>{name(p.location)}</span>
                        <span className="block text-xs text-muted-foreground">{countLabel(p)}</span>
                      </span>
                      <span className={cn("tabular text-base font-semibold", !count && "text-subtle-foreground")}>{n(count)}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>

      <Drawer
        open={current !== null}
        onOpenChange={(o) => !o && setSelected(null)}
        title={current ? name(current.location) : ""}
        description={current ? countLabel(current) : undefined}
      >
        {current && current.location && (
          <div className="mb-4 flex items-center justify-between gap-3 rounded-card border border-border bg-surface p-3 shadow-xs">
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-medium text-foreground">{name(current.location)}</p>
              <p className="text-[11px] text-muted-foreground">{countLabel(current)}</p>
            </div>
            <Link
              href={`/report?location=${encodeURIComponent(current.location.id)}`}
              className={cn(buttonVariants({ variant: "primary", size: "sm" }), "shrink-0 gap-1.5")}
            >
              <MapPin className="size-3.5" aria-hidden />
              {t("reportHere")}
            </Link>
          </div>
        )}

        {current && current.open.length + current.fixed.length === 0 ? (
          <EmptyState
            bare
            icon={Check}
            title={t("drawerEmptyTitle")}
            body={t("drawerEmptyBody")}
            action={
              current.location ? (
                <Link href={`/report?location=${encodeURIComponent(current.location.id)}`} className={buttonVariants({ variant: "primary" })}>
                  {t("reportHere")}
                </Link>
              ) : (
                <Link href="/report" className={buttonVariants({ variant: "primary" })}>{t("reportCta")}</Link>
              )
            }
          />
        ) : (
          <ul className="space-y-3">
            {current &&
              [...current.open, ...current.fixed].map((i) => (
                <li key={i.id}>
                  <IssueCard
                    compact
                    issue={{ ...i, photo_url: null, location: current.location ? { name_en: current.location.name_en, name_as: current.location.name_as } : null }}
                  />
                </li>
              ))}
          </ul>
        )}
      </Drawer>
    </div>
  );
}
