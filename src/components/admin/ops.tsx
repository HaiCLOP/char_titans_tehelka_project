import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { ArrowDownRight, ArrowRight, ArrowUpRight, ChevronRight, MapPin, UserPlus } from "lucide-react";
import { CATEGORY_ICON, Card, LangText, PriorityChip, RelativeTime, StatusChip, buttonVariants } from "@/components/ui";
import { SlaCountdown } from "@/components/ticket/sla-countdown";
import type { Category, Status } from "@/lib/domain";
import { useLocale } from "next-intl";
import { cn, toLocaleDigits } from "@/lib/utils";

// Building blocks of the admin Operations center (S13). Server components, monochrome tokens only:
// colour appears only where it means something (priority, overdue, fixed).

export type OpsTicket = {
  id: string;
  code: string;
  title_en: string | null;
  title_as: string | null;
  category: Category;
  priority: number;
  status: Status;
  assignee_id: string | null;
  sla_due_at: string | null;
  created_at: string;
  location_id: string | null;
};
export type OpsLocation = { id: string; name_en: string; name_as: string; map_x: number | null; map_y: number | null };

/** One "Needs attention" card: icon, headline count, short tag, one line, one action. */
export function AttentionCard({
  icon: Icon, title, tag, body, action, href, tone, quiet,
}: {
  icon: LucideIcon;
  title: string;
  tag?: string;
  body: string;
  action: string;
  href: string;
  tone: "danger" | "warning" | "neutral";
  /** Nothing to do: the card stays for orientation but its action steps back. */
  quiet?: boolean;
}) {
  return (
    <div className="flex h-full flex-col rounded-[1.25rem] border border-border bg-surface p-5 shadow-sm">
      <div className="flex items-start gap-3.5">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-surface-muted" aria-hidden>
          <Icon
            className={cn("size-[19px]", quiet ? "text-muted-foreground" : tone === "danger" ? "text-danger" : tone === "warning" ? "text-warning" : "text-foreground")}
            strokeWidth={1.75}
          />
        </span>
        <div className="min-w-0">
          <p className="text-[0.9375rem] font-semibold tracking-[-0.01em]">{title}</p>
          {tag && (
            <span
              className={cn(
                "mt-1.5 inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold",
                quiet ? "bg-surface-muted text-muted-foreground" : tone === "danger" ? "bg-danger-soft text-danger" : "bg-warning-soft text-warning",
              )}
            >
              {tag}
            </span>
          )}
          <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{body}</p>
        </div>
      </div>
      <div className="mt-auto pt-4">
        <Link href={href} className={buttonVariants({ variant: quiet ? "secondary" : "primary", size: "sm" })}>
          {action}
          <ArrowRight aria-hidden />
        </Link>
      </div>
    </div>
  );
}

/** KPI with a quiet icon, the value and (when it can be computed honestly) the change vs the previous period. */
export function OpsKpi({
  icon: Icon, label, value, delta, deltaLabel, tone, goodWhenUp,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  /** Percent change vs the previous period; null = not shown. */
  delta?: number | null;
  deltaLabel?: string;
  tone?: "danger";
  /** For "fixed" more is good; for "reported" more is bad. Only changes the arrow's meaning, not its colour. */
  goodWhenUp?: boolean;
}) {
  const up = (delta ?? 0) > 0;
  const locale = useLocale();
  return (
    <Card className="p-4 sm:p-5">
      {/* Phones: icon above the label so labels never truncate; wider screens: icon beside it. */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-surface-muted sm:size-10" aria-hidden>
          <Icon className={cn("size-[18px] sm:size-[19px]", tone === "danger" ? "text-danger" : "text-foreground")} strokeWidth={1.75} />
        </span>
        <div className="min-w-0">
          <p className="eyebrow">{label}</p>
          <p className={cn("tabular mt-1.5 text-[1.75rem] leading-none font-semibold tracking-[-0.02em]", tone === "danger" && "text-danger")}>{value}</p>
          {delta != null && deltaLabel && (
            <p className="mt-2 flex flex-wrap items-center gap-x-1 text-xs leading-snug text-muted-foreground">
              {up ? <ArrowUpRight className="size-3.5" strokeWidth={2} aria-hidden /> : <ArrowDownRight className="size-3.5" strokeWidth={2} aria-hidden />}
              <span
                className={cn(
                  "tabular font-semibold",
                  delta === 0 ? "text-muted-foreground" : (up === Boolean(goodWhenUp)) ? "text-success" : "text-danger",
                )}
              >
                {toLocaleDigits(Math.abs(delta), locale)}%
              </span>
              <span>{deltaLabel}</span>
            </p>
          )}
        </div>
      </div>
    </Card>
  );
}

/** Compact row for the high-priority list: category icon, title + code, priority, SLA, status, Assign. */
export function IssueRow({ t, assignLabel, openLabel }: { t: OpsTicket; assignLabel: string; openLabel: string }) {
  const Icon = CATEGORY_ICON[t.category];
  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3.5 sm:flex-nowrap sm:px-6">
      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-surface-muted" aria-hidden>
        <Icon className="size-[18px] text-foreground" strokeWidth={1.75} />
      </span>
      <Link href={`/admin/t/${t.id}`} className="min-w-0 flex-1 basis-40 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <LangText en={t.title_en} as={t.title_as} fallback={t.code} className="block truncate text-sm font-semibold tracking-[-0.01em]" />
        <span className="tabular block text-xs text-muted-foreground">{t.code}</span>
      </Link>
      <PriorityChip priority={t.priority} />
      <SlaCountdown due={t.sla_due_at} status={t.status} className="hidden shrink-0 text-xs whitespace-nowrap md:inline-flex" />
      <StatusChip status={t.status} />
      <Link
        href={`/admin/t/${t.id}`}
        className={buttonVariants({ variant: "secondary", size: "sm", className: "shrink-0" })}
        aria-label={`${t.assignee_id ? openLabel : assignLabel}: ${t.code}`}
      >
        {t.assignee_id ? <ChevronRight aria-hidden /> : <UserPlus aria-hidden />}
        <span className="hidden sm:inline">{t.assignee_id ? openLabel : assignLabel}</span>
      </Link>
    </li>
  );
}

/**
 * Small schematic campus plan: one node per building at locations.map_x/map_y, sized by open tickets,
 * ring colour = highest open priority. Same honest "schematic" idea as /map, at card size.
 */
export function MiniMap({
  locations, open, locale, label,
}: {
  locations: OpsLocation[];
  open: OpsTicket[];
  locale: string;
  label: string;
}) {
  const byLoc = new Map<string, { count: number; top: number }>();
  for (const t of open) {
    if (!t.location_id) continue;
    const cur = byLoc.get(t.location_id) ?? { count: 0, top: 4 };
    byLoc.set(t.location_id, { count: cur.count + 1, top: Math.min(cur.top, t.priority) });
  }
  const placed = locations.filter((l) => l.map_x != null && l.map_y != null);
  const W = 100;
  const H = 62;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} className="block h-auto w-full rounded-2xl bg-surface-muted">
      <defs>
        <pattern id="ops-grid" width="5" height="5" patternUnits="userSpaceOnUse">
          <path d="M5 0H0V5" fill="none" stroke="var(--border)" strokeWidth="0.2" />
        </pattern>
      </defs>
      <rect width={W} height={H} fill="url(#ops-grid)" />
      {placed.map((l) => {
        const x = 6 + (l.map_x as number) * (W - 12);
        const y = 6 + (l.map_y as number) * (H - 12);
        const hit = byLoc.get(l.id);
        const name = locale === "as" ? l.name_as : l.name_en;
        return (
          <g key={l.id}>
            {hit ? (
              <>
                <circle cx={x} cy={y} r={2.2 + Math.min(hit.count, 8) * 0.55} fill="var(--surface)" stroke={`var(--p${hit.top})`} strokeWidth="1.1" />
                <text x={x} y={y + 0.9} textAnchor="middle" fontSize="2.6" fontWeight="700" fill="var(--foreground)">{toLocaleDigits(hit.count, locale)}</text>
              </>
            ) : (
              <circle cx={x} cy={y} r="1" fill="none" stroke="var(--subtle-foreground)" strokeWidth="0.4" />
            )}
            <title>{hit ? `${name}: ${toLocaleDigits(hit.count, locale)}` : name}</title>
            {hit && (
              <text x={x} y={y + 6.2} textAnchor="middle" fontSize="2.4" fontWeight="600" fill="var(--foreground)">
                {name.length > 18 ? `${name.slice(0, 17)}…` : name}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

/** A legend entry under the map. */
export function LegendDot({ className, label, value }: { className: string; label: string; value: string }) {
  return (
    <span className="inline-flex items-center gap-2 text-sm text-muted-foreground">
      <span className={cn("size-2.5 rounded-full", className)} aria-hidden />
      <span className="tabular font-semibold text-foreground">{value}</span>
      {label}
    </span>
  );
}

/** Recent reports table row (cards on phones). */
export function RecentRow({ t, location, categoryLabel, reported }: { t: OpsTicket; location: OpsLocation | undefined; categoryLabel: string; reported: string }) {
  const Icon = CATEGORY_ICON[t.category];
  return (
    <tr className="group">
      <td className="max-w-[18rem] py-3 pr-4 pl-5 sm:pl-6">
        <Link href={`/admin/t/${t.id}`} className="block truncate font-medium group-hover:underline">
          <LangText en={t.title_en} as={t.title_as} fallback={t.code} />
        </Link>
      </td>
      <td className="hidden py-3 pr-4 text-muted-foreground md:table-cell">
        {location ? (
          <span className="inline-flex items-center gap-1.5"><MapPin className="size-3.5" strokeWidth={1.75} aria-hidden /><LangText en={location.name_en} as={location.name_as} /></span>
        ) : "—"}
      </td>
      <td className="hidden py-3 pr-4 text-muted-foreground lg:table-cell">
        <span className="inline-flex items-center gap-1.5"><Icon className="size-3.5" strokeWidth={1.75} aria-hidden />{categoryLabel}</span>
      </td>
      <td className="py-3 pr-4"><StatusChip status={t.status} /></td>
      <td className="hidden py-3 pr-4 sm:table-cell"><PriorityChip priority={t.priority} /></td>
      <td className="tabular hidden py-3 pr-4 text-muted-foreground xl:table-cell">{reported}</td>
      <td className="py-3 pr-5 text-right text-muted-foreground sm:pr-6"><RelativeTime date={t.created_at} className="tabular text-xs" /></td>
    </tr>
  );
}
