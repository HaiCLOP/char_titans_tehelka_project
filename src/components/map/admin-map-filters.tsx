import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { ChevronDown, SlidersHorizontal } from "lucide-react";
import { CATEGORY_ICON } from "@/components/ui";
import { CATEGORIES, type Category } from "@/lib/domain";
import { cn, toLocaleDigits } from "@/lib/utils";

export const STATUS_GROUPS = ["open", "fixed", "all"] as const;
export const MAP_DAYS = [1, 7, 30] as const;

export type AdminMapQuery = {
  category: Category | null;
  priority: number | null;
  status: (typeof STATUS_GROUPS)[number];
  days: number;
  department: string | null;
};

type Dept = { id: string; name_en: string; name_as: string };

const DEFAULTS: Record<string, string> = { status: "open", days: "30" };

function href(q: AdminMapQuery, patch: Partial<Record<keyof AdminMapQuery, string | null>>) {
  const merged: Record<string, string | null> = {
    category: q.category,
    priority: q.priority ? String(q.priority) : null,
    status: q.status,
    days: String(q.days),
    department: q.department,
    ...patch,
  };
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(merged)) if (v && DEFAULTS[k] !== v) p.set(k, v);
  const s = p.toString();
  return s ? `/admin/map?${s}` : "/admin/map";
}

const chip = (active: boolean) =>
  cn(
    "inline-flex min-h-10 max-w-full items-center gap-1.5 rounded-full border px-3.5 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
    active ? "border-primary bg-primary text-primary-foreground" : "border-border bg-surface text-foreground hover:border-border-strong",
  );

function L({ on, to, children }: { on: boolean; to: string; children: React.ReactNode }) {
  return (
    <Link href={to} scroll={false} aria-current={on ? "true" : undefined} className={chip(on)}>
      {children}
    </Link>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
      <span className="w-24 shrink-0 text-xs font-medium text-muted-foreground">{label}</span>
      <div role="group" aria-label={label} className="flex min-w-0 flex-wrap gap-2">
        {children}
      </div>
    </div>
  );
}

/** S17 URL filters: status group, days, priority, category, department (super admin). Server-rendered links. */
export async function AdminMapFilters({ query: q, departments }: { query: AdminMapQuery; departments: Dept[] }) {
  const [t, tc, tp, locale] = await Promise.all([
    getTranslations("adminMap"),
    getTranslations("category"),
    getTranslations("priority"),
    getLocale(),
  ]);
  const n = (v: number) => toLocaleDigits(v, locale);

  return (
    <div className="space-y-4 rounded-card border border-border bg-surface p-4 sm:p-5" aria-label={t("filters")} role="search">
      <Row label={t("statusLabel")}>
        {STATUS_GROUPS.map((s) => (
          <L key={s} on={q.status === s} to={href(q, { status: s })}>
            {t(`status.${s}`)}
          </L>
        ))}
        <span className="mx-1 h-6 w-px shrink-0 self-center bg-border" aria-hidden />
        {MAP_DAYS.map((d) => (
          <L key={d} on={q.days === d} to={href(q, { days: String(d) })}>
            {t("days", { count: d, n: n(d) })}
          </L>
        ))}
      </Row>
      <details className="group border-t border-border pt-3" open={q.priority != null || q.category != null || q.department != null}>
        <summary className="flex min-h-10 cursor-pointer list-none items-center gap-2 text-sm font-medium [&::-webkit-details-marker]:hidden">
          <SlidersHorizontal className="size-4 text-muted-foreground" strokeWidth={1.75} aria-hidden />
          <span className="flex-1">{t("moreFilters")}</span>
          <Link href="/admin/map" className="rounded-full border border-border px-3 py-2 text-xs text-muted-foreground hover:text-foreground">{t("resetFilters")}</Link>
          <ChevronDown className="size-4 transition-transform group-open:rotate-180" strokeWidth={1.75} aria-hidden />
        </summary>
        <div className="mt-3 space-y-4">
      <Row label={t("priorityLabel")}>
        <L on={q.priority === null} to={href(q, { priority: null })}>
          {t("any")}
        </L>
        {[1, 2, 3, 4].map((p) => (
          <L key={p} on={q.priority === p} to={href(q, { priority: String(p) })}>
            <span className="size-2.5 rounded-full border-2 bg-surface" style={{ borderColor: `var(--p${p})` }} aria-hidden />
            {tp(String(p))}
          </L>
        ))}
      </Row>
      <Row label={t("categoryLabel")}>
        <L on={q.category === null} to={href(q, { category: null })}>
          {t("any")}
        </L>
        {CATEGORIES.map((c) => {
          const Icon = CATEGORY_ICON[c];
          return (
            <L key={c} on={q.category === c} to={href(q, { category: c })}>
              <Icon className="size-4" strokeWidth={1.75} aria-hidden />
              {tc(c)}
            </L>
          );
        })}
      </Row>
      {departments.length > 0 && (
        <Row label={t("departmentLabel")}>
          <L on={q.department === null} to={href(q, { department: null })}>
            {t("allDepartments")}
          </L>
          {departments.map((d) => (
            <L key={d.id} on={q.department === d.id} to={href(q, { department: d.id })}>
              <span lang={locale}>{locale === "as" ? d.name_as || d.name_en : d.name_en}</span>
            </L>
          ))}
        </Row>
      )}
        </div>
      </details>
    </div>
  );
}
