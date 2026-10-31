"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import {
  BookOpen,
  Building2,
  Check,
  Compass,
  DoorOpen,
  FlaskConical,
  Home,
  Landmark,
  Laptop,
  Map as MapIcon,
  MapPin,
  MapPinOff,
  Navigation,
  RotateCcw,
  Search,
  Trophy,
  UtensilsCrossed,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { CATEGORY_ICON, Card, Chip, Drawer, EmptyState, IssueCard, buttonVariants } from "@/components/ui";
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
  visibility?: "public" | "private";
  is_sensitive?: boolean;
};

export type MapLabels = Partial<
  Record<"legendSize" | "emptyTitle" | "emptyBody" | "drawerEmptyBody" | "private" | "sensitive", string>
>;

type Props = {
  locations: MapLocation[];
  /** Open public issues, plus public issues fixed in the last 7 days when `includeFixed`. */
  issues: MapIssue[];
  category: Category | null;
  includeFixed: boolean;
  filters?: React.ReactNode;
  issueHrefBase?: string;
  sizeBy?: "all" | "open";
  reportCta?: boolean;
  labels?: MapLabels;
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

function getLocationIcon(type: string | null, nameEn: string) {
  const n = (nameEn ?? "").toLowerCase();
  if (n.includes("library")) return BookOpen;
  if (n.includes("admin")) return Landmark;
  if (n.includes("computer") || n.includes("science &")) return Laptop;
  if (n.includes("science")) return FlaskConical;
  if (n.includes("auditorium")) return DoorOpen;
  if (n.includes("gate")) return Navigation;
  if (n.includes("hostel")) return Home;
  if (n.includes("canteen")) return UtensilsCrossed;
  if (n.includes("playground") || n.includes("ground")) return Trophy;

  if (type === "academic") return FlaskConical;
  if (type === "hostel") return Home;
  if (type === "food") return UtensilsCrossed;
  if (type === "sports") return Trophy;
  if (type === "admin") return Landmark;
  return Building2;
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
    return {
      id,
      location,
      open: o,
      fixed: fixed.get(id) ?? [],
      top: o.length ? Math.min(...o.map((i) => i.priority)) : null,
    };
  };
  return { list: locations.map((l) => place(l.id, l)), none: place(NONE, null) };
}

/**
 * S11 & S17 — Modern campus map & building inspector.
 * Responsive for mobile phones (360px+) with zero pin collisions, tap inspection,
 * zoom controls, and a dedicated buildings directory.
 */
export function CampusMap({
  locations,
  issues,
  category,
  includeFixed,
  filters,
  issueHrefBase = "/c/",
  sizeBy = "all",
  reportCta = true,
  labels = {},
}: Props) {
  const t = useTranslations("map");
  const tc = useTranslations("category");
  const tp = useTranslations("priority");
  const locale = useLocale();
  const n = (v: number) => toLocaleDigits(v, locale);
  const name = (l: MapLocation | null) =>
    l ? (locale === "as" ? l.name_as || l.name_en : l.name_en) : t("noBuilding");

  const [selected, setSelected] = useState<string | null>(null);
  const [drawerPlace, setDrawerPlace] = useState<Place | null>(null);
  const [sort, setSort] = useState<"count" | "name">("count");
  const [searchQuery, setSearchQuery] = useState("");
  const [mobileTab, setMobileTab] = useState<"map" | "list">("map");
  const [zoom, setZoom] = useState<number>(1);

  const handleZoomIn = () => setZoom((z) => Math.min(1.8, Number((z + 0.35).toFixed(2))));
  const handleZoomOut = () => setZoom((z) => Math.max(1, Number((z - 0.35).toFixed(2))));
  const handleResetZoom = () => setZoom(1);

  const sized = (p: Place) => (sizeBy === "open" ? p.open.length : p.open.length + p.fixed.length);

  // Category counts ignore category filter so chips show totals
  const catCounts = useMemo(() => {
    const m = new Map<Category, number>();
    for (const i of issues) m.set(i.category, (m.get(i.category) ?? 0) + 1);
    return m;
  }, [issues]);

  const places = useMemo(() => groupPlaces(locations, issues, category), [locations, issues, category]);

  const total =
    places.list.reduce((s, p) => s + sized(p), 0) +
    (sizeBy === "open" ? places.none.open.length : places.none.open.length + places.none.fixed.length);

  const plotted = places.list.filter((p) => p.location?.map_x != null && p.location?.map_y != null);

  const xs = plotted.map((p) => p.location!.map_x!);
  const ys = plotted.map((p) => p.location!.map_y!);

  const fit = (v: number, vals: number[]) => {
    if (vals.length <= 1) return 0.5;
    const lo = Math.min(...vals);
    const span = Math.max(...vals) - lo;
    if (span <= 0) return 0.5;
    return 0.12 + 0.76 * ((v - lo) / span);
  };

  const posMap = useMemo(() => {
    const m = new Map<string, { x: number; y: number }>();
    for (const p of plotted) {
      if (p.location?.map_x != null && p.location?.map_y != null) {
        m.set(p.location.name_en.toLowerCase(), {
          x: fit(p.location.map_x, xs) * 100,
          y: fit(p.location.map_y, ys) * 100,
        });
      }
    }
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plotted]);

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
        : sized(b) - sized(a) || coll.compare(name(a.location), name(b.location)),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [places, sort, locale, searchQuery, sizeBy]);

  const current = selected === NONE ? places.none : places.list.find((p) => p.id === selected) ?? null;

  const ringColor = (p: Place) =>
    p.top !== null ? `var(--p${p.top})` : p.fixed.length ? "var(--success)" : "var(--border-strong)";

  const countLabel = (p: Place) =>
    [
      t("openCount", { count: p.open.length, n: n(p.open.length) }),
      p.fixed.length ? t("fixedCount", { n: n(p.fixed.length) }) : null,
    ]
      .filter(Boolean)
      .join(" · ");

  const chip = (active: boolean) =>
    cn(
      "inline-flex h-8 sm:h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 sm:px-3.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
      active
        ? "border-primary bg-primary text-primary-foreground font-semibold shadow-xs"
        : "border-border bg-surface text-foreground hover:border-border-strong",
    );

  const presentCats = CATEGORIES.filter((c) => catCounts.has(c) || c === category);

  // Key campus nodes for architectural SVG pathways
  const pGate = posMap.get("main gate");
  const pAdmin = posMap.get("administrative building");
  const pLibrary = posMap.get("central library");
  const pScience = posMap.get("science block");
  const pCS = posMap.get("centre for computer science & applications");
  const pCanteen = posMap.get("canteen");
  const pBoys = posMap.get("boys hostel");
  const pGirls = posMap.get("girls hostel");
  const pAudit = posMap.get("auditorium");
  const pPlayground = posMap.get("playground");

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Category Filter Chips Bar or Custom Admin Filters */}
      {filters ?? (
        <div
          className="flex items-center gap-2 overflow-x-auto pb-1 sm:flex-wrap sm:overflow-visible sm:pb-0 [scrollbar-width:none]"
          role="group"
          aria-label={t("filterLabel")}
        >
          <Link
            href={href(null, includeFixed)}
            scroll={false}
            aria-current={category === null ? "true" : undefined}
            className={chip(category === null)}
          >
            {t("allCategories")}
            <span className="tabular text-xs opacity-75">{n(issues.length)}</span>
          </Link>
          {presentCats.map((c) => {
            const Icon = CATEGORY_ICON[c];
            return (
              <Link
                key={c}
                href={href(c, includeFixed)}
                scroll={false}
                aria-current={category === c ? "true" : undefined}
                className={chip(category === c)}
              >
                <Icon className="size-3.5" {...ICON} />
                {tc(c)}
                <span className="tabular text-xs opacity-75">{n(catCounts.get(c) ?? 0)}</span>
              </Link>
            );
          })}
          <span className="mx-1 hidden h-6 w-px bg-border sm:block" aria-hidden />
          <Link
            href={href(category, !includeFixed)}
            scroll={false}
            aria-current={includeFixed ? "true" : undefined}
            className={chip(includeFixed)}
          >
            <span
              className={cn(
                "grid size-4 place-items-center rounded-[5px] border",
                includeFixed ? "border-primary-foreground" : "border-border-strong",
              )}
              aria-hidden
            >
              {includeFixed && <Check className="size-3" strokeWidth={2.5} />}
            </span>
            {t("includeFixed")}
          </Link>
        </div>
      )}

      {/* Mobile Segmented Switch: Map vs Buildings List */}
      <div
        className="flex xl:hidden rounded-full border border-border bg-surface-muted/80 p-1"
        role="tablist"
        aria-label={t("filterLabel")}
      >
        <button
          type="button"
          role="tab"
          aria-selected={mobileTab === "map"}
          onClick={() => setMobileTab("map")}
          className={cn(
            "flex-1 rounded-full py-2 text-xs font-semibold transition-all flex items-center justify-center gap-1.5",
            mobileTab === "map"
              ? "bg-surface text-foreground shadow-xs ring-1 ring-border font-bold"
              : "text-muted-foreground hover:text-foreground",
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
            mobileTab === "list"
              ? "bg-surface text-foreground shadow-xs ring-1 ring-border font-bold"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          <Building2 className="size-3.5" aria-hidden />
          {t("tabBuildings")}
          <span className="tabular text-[10px] opacity-75">({n(sorted.length)})</span>
        </button>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        {/* ========================================================= */}
        {/* Modern Interactive Campus Plan Card                       */}
        {/* ========================================================= */}
        <Card className={cn("relative overflow-hidden p-0", mobileTab === "list" && "hidden xl:block")}>
          <div
            className={cn(
              "relative h-[400px] sm:h-[480px] lg:h-[540px] w-full bg-gradient-to-b from-surface via-surface to-surface-muted/30 select-none",
              zoom > 1 ? "overflow-auto touch-pan-x touch-pan-y" : "overflow-hidden",
            )}
          >
            {/* Top-Left Campus Orientation Pill */}
            <div className="absolute top-3 left-3 z-20 flex items-center gap-1.5 rounded-full border border-border/80 bg-surface/90 backdrop-blur-xs px-2.5 py-1 text-[10px] font-semibold text-muted-foreground shadow-2xs">
              <Compass className="size-3 text-primary animate-pulse" aria-hidden />
              <span>N · Dibrugarh Univ</span>
            </div>

            {/* Top-Right Floating Zoom Controls */}
            <div className="absolute top-3 right-3 z-20 flex items-center rounded-lg border border-border/80 bg-surface/90 backdrop-blur-xs shadow-2xs overflow-hidden">
              <button
                type="button"
                onClick={handleZoomIn}
                title="Zoom In"
                aria-label="Zoom In"
                className="grid size-7 place-items-center text-muted-foreground hover:bg-surface-muted hover:text-foreground transition-colors border-r border-border/60"
              >
                <ZoomIn className="size-3.5" aria-hidden />
              </button>
              <button
                type="button"
                onClick={handleZoomOut}
                title="Zoom Out"
                aria-label="Zoom Out"
                className="grid size-7 place-items-center text-muted-foreground hover:bg-surface-muted hover:text-foreground transition-colors border-r border-border/60"
              >
                <ZoomOut className="size-3.5" aria-hidden />
              </button>
              <button
                type="button"
                onClick={handleResetZoom}
                title="Reset View"
                aria-label="Reset View"
                className="grid size-7 place-items-center text-muted-foreground hover:bg-surface-muted hover:text-foreground transition-colors"
              >
                <RotateCcw className="size-3" aria-hidden />
              </button>
            </div>

            {/* Zoomable Canvas Container */}
            <div
              className="relative size-full transition-transform duration-300 ease-out origin-center"
              style={{ transform: `scale(${zoom})` }}
            >
              {/* Subtle Architectural Grid */}
              <svg className="absolute inset-0 size-full text-border/40 pointer-events-none" aria-hidden>
                <defs>
                  <pattern id="cs-campus-grid" width="32" height="32" patternUnits="userSpaceOnUse">
                    <path d="M32 0H0V32" fill="none" stroke="currentColor" strokeWidth="1" strokeDasharray="2 4" />
                  </pattern>
                </defs>
                <rect width="100%" height="100%" fill="url(#cs-campus-grid)" />
              </svg>

              {/* Campus Sector Watermarks */}
              <div className="absolute inset-0 pointer-events-none overflow-hidden select-none" aria-hidden>
                <span className="absolute top-[8%] left-[22%] text-[9px] sm:text-[10px] font-bold uppercase tracking-widest text-muted-foreground/30">
                  Academic Sector
                </span>
                <span className="absolute top-[48%] left-[10%] text-[9px] sm:text-[10px] font-bold uppercase tracking-widest text-muted-foreground/30">
                  Residential Sector
                </span>
                <span className="absolute top-[18%] right-[12%] text-[9px] sm:text-[10px] font-bold uppercase tracking-widest text-muted-foreground/30">
                  Admin Plaza
                </span>
                <span className="absolute bottom-[22%] right-[14%] text-[9px] sm:text-[10px] font-bold uppercase tracking-widest text-muted-foreground/30">
                  Sports Complex
                </span>
                <span className="absolute bottom-[6%] left-[45%] text-[9px] sm:text-[10px] font-bold uppercase tracking-widest text-muted-foreground/30">
                  Main Campus Entry
                </span>
              </div>

              {/* Connecting Campus Pathways SVG Overlay */}
              <svg className="absolute inset-0 size-full pointer-events-none" aria-hidden>
                {/* Central Avenue: Gate -> Canteen -> Admin */}
                {pGate && pCanteen && pAdmin && (
                  <path
                    d={`M ${pGate.x}% ${pGate.y}% Q ${pCanteen.x}% ${pCanteen.y + 10}% ${pCanteen.x}% ${pCanteen.y}% T ${pAdmin.x}% ${pAdmin.y}%`}
                    fill="none"
                    className="stroke-border/70 dark:stroke-border/40"
                    strokeWidth="2.5"
                    strokeDasharray="4 4"
                  />
                )}
                {/* Academic Spine: Library -> Science -> CS -> Admin */}
                {pLibrary && pScience && pCS && pAdmin && (
                  <path
                    d={`M ${pLibrary.x}% ${pLibrary.y}% L ${pScience.x}% ${pScience.y}% L ${pCS.x}% ${pCS.y}% L ${pAdmin.x}% ${pAdmin.y}%`}
                    fill="none"
                    className="stroke-border/70 dark:stroke-border/40"
                    strokeWidth="2.5"
                    strokeDasharray="4 4"
                  />
                )}
                {/* Residential Link: Canteen -> Boys Hostel -> Girls Hostel */}
                {pCanteen && pBoys && pGirls && (
                  <path
                    d={`M ${pCanteen.x}% ${pCanteen.y}% L ${pBoys.x}% ${pBoys.y}% L ${pGirls.x}% ${pGirls.y}%`}
                    fill="none"
                    className="stroke-border/70 dark:stroke-border/40"
                    strokeWidth="2"
                    strokeDasharray="3 3"
                  />
                )}
                {/* Sports Link: Admin -> Auditorium -> Playground */}
                {pAdmin && pAudit && pPlayground && (
                  <path
                    d={`M ${pAdmin.x}% ${pAdmin.y}% L ${pAudit.x}% ${pAudit.y}% L ${pPlayground.x}% ${pPlayground.y}%`}
                    fill="none"
                    className="stroke-border/70 dark:stroke-border/40"
                    strokeWidth="2"
                    strokeDasharray="3 3"
                  />
                )}
              </svg>

              {/* Plotted Campus Pins */}
              <div className="absolute inset-0" role="group" aria-label={t("planLabel")}>
                {plotted.map((p) => {
                  const count = sized(p);
                  const on = selected === p.id;
                  const LocIcon = getLocationIcon(p.location?.type ?? null, p.location?.name_en ?? "");
                  const hasCritical = p.open.some((i) => i.priority === 1);

                  return (
                    <div
                      key={p.id}
                      style={{
                        left: `${fit(p.location!.map_x!, xs) * 100}%`,
                        top: `${fit(p.location!.map_y!, ys) * 100}%`,
                      }}
                      className={cn(
                        "group absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center transition-transform duration-200 focus-visible:outline-none touch-manipulation",
                        count > 0 ? "z-10" : "z-0",
                        on && "z-30 scale-110",
                      )}
                    >
                      {/* Active Pin Floating Tooltip (Visible on tap or hover) */}
                      <div
                        className={cn(
                          "pointer-events-none absolute -top-8 whitespace-nowrap rounded-md border border-border/80 bg-foreground px-2 py-0.5 text-[10px] font-semibold text-background shadow-md transition-all duration-200 z-40",
                          on
                            ? "opacity-100 scale-100 -translate-y-1"
                            : "opacity-0 scale-95 group-hover:opacity-100 group-hover:scale-100",
                        )}
                      >
                        <span>{name(p.location)}</span>
                        {count > 0 && <span className="ml-1 opacity-80">({n(count)})</span>}
                      </div>

                      {/* Pin Circle Marker */}
                      <button
                        type="button"
                        onClick={() => setSelected(on ? null : p.id)}
                        aria-label={`${name(p.location)}: ${countLabel(p)}`}
                        className={cn(
                          "relative grid size-8 sm:size-9 place-items-center rounded-full bg-surface text-xs font-bold tabular shadow-xs transition-all duration-200 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                          count > 0 ? "border-[2.5px]" : "border-2",
                          on
                            ? "ring-4 ring-primary ring-offset-2 ring-offset-surface shadow-md bg-primary text-primary-foreground border-primary scale-110"
                            : "hover:scale-110",
                        )}
                        style={{ borderColor: on ? undefined : ringColor(p) }}
                      >
                        {/* Animated ping halo for critical open issues */}
                        {hasCritical && !on && (
                          <span
                            className="absolute -inset-1 rounded-full animate-ping opacity-60 pointer-events-none"
                            style={{ backgroundColor: "var(--p1)" }}
                            aria-hidden
                          />
                        )}

                        {count > 0 ? (
                          <span>{n(count)}</span>
                        ) : (
                          <LocIcon className="size-3.5 text-muted-foreground/80" aria-hidden />
                        )}
                      </button>

                      {/* Desktop-only subtle label pill (Hidden on mobile phones to prevent overlap) */}
                      <span
                        lang={locale}
                        className={cn(
                          "mt-1 hidden sm:block max-w-[85px] sm:max-w-[105px] truncate rounded-md px-1.5 py-0.5 text-center text-[10px] sm:text-[11px] font-semibold leading-tight shadow-2xs transition-colors border",
                          on
                            ? "bg-primary text-primary-foreground border-primary"
                            : count > 0
                              ? "bg-surface/95 text-foreground border-border/80 group-hover:border-primary/50"
                              : "bg-surface/80 text-muted-foreground border-border/50",
                        )}
                      >
                        {name(p.location)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Docked Building Inspector Card (Slides in smoothly when a pin is tapped) */}
            {current && current.location && (
              <div className="absolute inset-x-2.5 bottom-2.5 sm:inset-x-4 sm:bottom-4 z-30 rounded-2xl border border-border/80 bg-surface/95 backdrop-blur-md p-3.5 sm:p-4 shadow-xl transition-all animate-in slide-in-from-bottom-2 duration-200">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      {(() => {
                        const Icon = getLocationIcon(current.location.type, current.location.name_en);
                        return (
                          <span className="grid size-6 place-items-center rounded-lg bg-primary/10 text-primary shrink-0">
                            <Icon className="size-3.5" aria-hidden />
                          </span>
                        );
                      })()}
                      <h3 className="font-bold text-sm sm:text-base text-foreground truncate">
                        {name(current.location)}
                      </h3>
                      {current.location.type && (
                        <span className="rounded-full bg-surface-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide border border-border/50">
                          {current.location.type}
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">{countLabel(current)}</p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {reportCta && (
                      <Link
                        href={`/report?location=${encodeURIComponent(current.location.id)}`}
                        className={buttonVariants({
                          variant: "primary",
                          size: "sm",
                          className: "h-8 px-3 text-xs gap-1.5 rounded-lg font-semibold shadow-xs",
                        })}
                      >
                        <MapPin className="size-3.5" aria-hidden />
                        <span>{t("reportHere")}</span>
                      </Link>
                    )}
                    <button
                      type="button"
                      onClick={() => setSelected(null)}
                      className="grid size-8 place-items-center rounded-lg text-muted-foreground hover:bg-surface-muted hover:text-foreground transition-colors"
                      aria-label="Close details"
                    >
                      <X className="size-4" aria-hidden />
                    </button>
                  </div>
                </div>

                {/* Complaints list inside the floating card */}
                {current.open.length + current.fixed.length > 0 ? (
                  <div className="mt-2.5 space-y-2 border-t border-border/60 pt-2.5">
                    <ul className="space-y-2 max-h-40 sm:max-h-52 overflow-y-auto pr-1">
                      {[...current.open, ...current.fixed].map((i) => (
                        <li key={i.id}>
                          <IssueCard
                            compact
                            href={`${issueHrefBase}${i.id}`}
                            footer={
                              i.is_sensitive || i.visibility === "private" ? (
                                <div className="flex flex-wrap gap-1.5">
                                  {i.is_sensitive ? <Chip tone="danger">{labels.sensitive}</Chip> : <Chip>{labels.private}</Chip>}
                                </div>
                              ) : undefined
                            }
                            issue={{
                              ...i,
                              photo_url: null,
                              location: {
                                name_en: current.location!.name_en,
                                name_as: current.location!.name_as,
                              },
                            }}
                          />
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground pt-1.5">{labels.drawerEmptyBody ?? t("drawerEmptyBody")}</p>
                )}
              </div>
            )}
          </div>

          {/* Map Legend Strip */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-border px-3.5 py-2.5 sm:px-5 sm:py-3 text-[11px] sm:text-xs text-muted-foreground bg-surface/60">
            {[1, 2, 3, 4].map((p) => (
              <span key={p} className="inline-flex items-center gap-1.5">
                <span
                  className="size-2.5 rounded-full border-[2.5px] bg-surface"
                  style={{ borderColor: `var(--p${p})` }}
                  aria-hidden
                />
                <span>{tp(String(p))}</span>
              </span>
            ))}
            {includeFixed && (
              <span key="fixed" className="inline-flex items-center gap-1.5">
                <span className="size-2.5 rounded-full border-[2.5px] border-success bg-surface" aria-hidden />
                <span>{t("legendFixed")}</span>
              </span>
            )}
            <span className="inline-flex items-center gap-1.5">
              <span className="size-2 rounded-full border-2 border-border-strong bg-surface" aria-hidden />
              <span>{t("legendNone")}</span>
            </span>
            <span className="w-full sm:ml-auto sm:w-auto text-[10px] sm:text-[11px] opacity-75">
              {labels.legendSize ?? t("legendSize")}
            </span>
          </div>
        </Card>

        {/* ========================================================= */}
        {/* Buildings Directory Sidebar (Sortable & Searchable)       */}
        {/* ========================================================= */}
        <Card className={cn("self-start p-0", mobileTab === "map" && "hidden xl:block")}>
          <div className="flex items-center justify-between gap-3 px-4 pt-4 sm:px-5 sm:pt-5">
            <h2 className="text-base sm:text-lg font-bold tracking-tight text-foreground">{t("buildings")}</h2>
            <div
              role="group"
              aria-label={t("sortLabel")}
              className="inline-flex rounded-full bg-surface-muted/80 p-0.5 sm:p-1 border border-border/60"
            >
              {(["count", "name"] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  aria-pressed={sort === s}
                  onClick={() => setSort(s)}
                  className={cn(
                    "h-7 sm:h-8 rounded-full px-2.5 sm:px-3 text-[11px] sm:text-xs font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    sort === s
                      ? "bg-surface text-foreground shadow-xs ring-1 ring-border font-semibold"
                      : "text-muted-foreground hover:text-foreground",
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
              title={labels.emptyTitle ?? (category ? t("emptyFilteredTitle") : t("emptyTitle"))}
              body={labels.emptyBody ?? (category ? t("emptyFilteredBody") : t("emptyBody"))}
              action={
                !reportCta ? undefined : category ? (
                  <Link href={href(null, includeFixed)} className={buttonVariants({ variant: "secondary" })}>
                    {t("clearFilter")}
                  </Link>
                ) : (
                  <Link href="/report" className={buttonVariants({ variant: "primary" })}>
                    {t("reportCta")}
                  </Link>
                )
              }
            />
          )}

          {sorted.length === 0 ? (
            <p className="px-5 py-6 text-sm text-muted-foreground">
              {searchQuery ? t("searchEmpty") : t("noBuildings")}
            </p>
          ) : (
            <ul className="mt-3 divide-y divide-border border-t border-border">
              {sorted.map((p) => {
                const count = sized(p);
                const on = selected === p.id;
                const LocIcon = getLocationIcon(p.location?.type ?? null, p.location?.name_en ?? "");

                return (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => setDrawerPlace(p)}
                      aria-haspopup="dialog"
                      className={cn(
                        "flex w-full items-center gap-2.5 sm:gap-3 px-4 sm:px-5 py-3 text-left transition-colors hover:bg-surface-muted focus-visible:bg-surface-muted focus-visible:outline-none",
                        on && "bg-surface-muted font-medium",
                      )}
                    >
                      {p.location ? (
                        <span
                          className="grid size-7 place-items-center rounded-lg border bg-surface shrink-0"
                          style={{ borderColor: ringColor(p) }}
                          aria-hidden
                        >
                          <LocIcon className="size-3.5 text-muted-foreground" />
                        </span>
                      ) : (
                        <MapPinOff className="size-4 shrink-0 text-muted-foreground" {...ICON} />
                      )}
                      <span className="min-w-0 flex-1">
                        <span
                          lang={locale}
                          className={cn("block truncate text-xs sm:text-sm", count ? "font-semibold" : "text-muted-foreground")}
                        >
                          {name(p.location)}
                        </span>
                        <span className="block text-[11px] text-muted-foreground">{countLabel(p)}</span>
                      </span>
                      <span className={cn("tabular text-sm sm:text-base font-bold", !count && "text-subtle-foreground")}>
                        {n(count)}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>

      {/* Buildings Directory Drawer (Opens when tapped from the directory list) */}
      <Drawer
        open={drawerPlace !== null}
        onOpenChange={(o) => !o && setDrawerPlace(null)}
        title={drawerPlace ? name(drawerPlace.location) : ""}
        description={drawerPlace ? countLabel(drawerPlace) : undefined}
      >
        {drawerPlace && drawerPlace.location && (
          <div className="mb-4 flex items-center justify-between gap-3 rounded-card border border-border bg-surface p-3 shadow-xs">
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-semibold text-foreground">{name(drawerPlace.location)}</p>
              <p className="text-[11px] text-muted-foreground">{countLabel(drawerPlace)}</p>
            </div>
            {reportCta && (
              <Link
                href={`/report?location=${encodeURIComponent(drawerPlace.location.id)}`}
                className={cn(buttonVariants({ variant: "primary", size: "sm" }), "shrink-0 gap-1.5")}
              >
                <MapPin className="size-3.5" aria-hidden />
                <span>{t("reportHere")}</span>
              </Link>
            )}
          </div>
        )}

        {drawerPlace && drawerPlace.open.length + drawerPlace.fixed.length === 0 ? (
          <EmptyState
            bare
            icon={Check}
            title={t("drawerEmptyTitle")}
            body={labels.drawerEmptyBody ?? t("drawerEmptyBody")}
            action={
              !reportCta ? undefined : drawerPlace.location ? (
                <Link
                  href={`/report?location=${encodeURIComponent(drawerPlace.location.id)}`}
                  className={buttonVariants({ variant: "primary" })}
                >
                  {t("reportHere")}
                </Link>
              ) : (
                <Link href="/report" className={buttonVariants({ variant: "primary" })}>
                  {t("reportCta")}
                </Link>
              )
            }
          />
        ) : (
          <ul className="space-y-3">
            {drawerPlace &&
              [...drawerPlace.open, ...drawerPlace.fixed].map((i) => (
                <li key={i.id}>
                  <IssueCard
                    compact
                    href={`${issueHrefBase}${i.id}`}
                    footer={
                      i.is_sensitive || i.visibility === "private" ? (
                        <div className="flex flex-wrap gap-1.5">
                          {i.is_sensitive ? <Chip tone="danger">{labels.sensitive}</Chip> : <Chip>{labels.private}</Chip>}
                        </div>
                      ) : undefined
                    }
                    issue={{
                      ...i,
                      photo_url: null,
                      location: drawerPlace.location
                        ? { name_en: drawerPlace.location.name_en, name_as: drawerPlace.location.name_as }
                        : null,
                    }}
                  />
                </li>
              ))}
          </ul>
        )}
      </Drawer>
    </div>
  );
}
