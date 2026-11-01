"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import {
  Building2,
  Phone,
  MapPin,
  Clock,
  Star,
  Search,
  ChevronRight,
} from "lucide-react";
import { CATEGORIES, type Category } from "@/lib/domain";
import { Card, CategoryChip, buttonVariants } from "@/components/ui";
import { cn, toLocaleDigits } from "@/lib/utils";

export interface DepartmentItem {
  id: string;
  name_en: string;
  name_as: string;
  categories: Category[];
  office_location_en: string;
  office_location_as: string;
  contact_email: string;
  contact_phone: string;
  operating_hours_en: string;
  operating_hours_as: string;
  description_en: string;
  description_as: string;
  services_en: string[];
  services_as: string[];
  is_emergency_service: boolean;
  stats: {
    open_count: number;
    resolved_count: number;
    sla_compliance_pct: number;
    user_rating_avg: number | null;
    user_rating_count: number;
    performance_score: number | null;
    confidence: "sufficient" | "low_data";
  };
}

export function DepartmentsClient({ departments }: { departments: DepartmentItem[] }) {
  const t = useTranslations("departments");
  const tc = useTranslations("category");
  const locale = useLocale();
  const n = (val: number) => toLocaleDigits(val, locale);

  const [query, setQuery] = useState("");
  const [selectedCat, setSelectedCat] = useState<string>("all");

  const filtered = useMemo(() => {
    return departments.filter((d) => {
      const name = (locale === "as" ? d.name_as : d.name_en).toLowerCase();
      const desc = (locale === "as" ? d.description_as : d.description_en).toLowerCase();
      const q = query.toLowerCase().trim();
      const matchesQuery = !q || name.includes(q) || desc.includes(q);

      const matchesCat =
        selectedCat === "all" ||
        d.categories.includes(selectedCat as Category);

      return matchesQuery && matchesCat;
    });
  }, [departments, query, selectedCat, locale]);

  return (
    <div className="space-y-6">
      {/* Search and Category Filter Toolbar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("searchPlaceholder")}
            className="w-full rounded-full border border-border bg-surface pl-10 pr-4 py-2 text-sm text-foreground placeholder:text-muted-foreground/60 outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/15"
          />
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none]">
          <button
            type="button"
            onClick={() => setSelectedCat("all")}
            className={cn(
              "rounded-full px-3 py-1 text-xs font-medium transition-colors shrink-0",
              selectedCat === "all"
                ? "bg-primary text-primary-foreground"
                : "border border-border bg-surface text-muted-foreground hover:text-foreground"
            )}
          >
            {t("allCategories")}
          </button>
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setSelectedCat(cat)}
              className={cn(
                "rounded-full px-3 py-1 text-xs font-medium transition-colors shrink-0",
                selectedCat === cat
                  ? "bg-primary text-primary-foreground"
                  : "border border-border bg-surface text-muted-foreground hover:text-foreground"
              )}
            >
              {tc(cat)}
            </button>
          ))}
        </div>
      </div>

      {/* Directory Grid */}
      {filtered.length === 0 ? (
        <Card className="p-8 text-center">
          <p className="text-sm text-muted-foreground">{t("noResults")}</p>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((d) => {
            const name = locale === "as" ? d.name_as : d.name_en;
            const location = locale === "as" ? d.office_location_as : d.office_location_en;
            const hours = locale === "as" ? d.operating_hours_as : d.operating_hours_en;
            const desc = locale === "as" ? d.description_as : d.description_en;

            return (
              <Card key={d.id} className="flex flex-col justify-between p-5 hover:border-border-strong transition-all">
                <div className="space-y-3.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-surface-muted text-foreground border border-border shadow-2xs">
                        <Building2 className="size-4" strokeWidth={1.75} />
                      </span>
                      <div className="min-w-0">
                        <h3 className="font-semibold text-sm sm:text-base text-foreground truncate">
                          {name}
                        </h3>
                        {d.is_emergency_service && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-primary">
                            <span className="size-1.5 rounded-full bg-primary animate-pulse" />
                            {t("emergency247")}
                          </span>
                        )}
                      </div>
                    </div>

                    {d.stats.performance_score !== null ? (
                      <span className="shrink-0 rounded-full border border-border bg-surface-muted px-2.5 py-0.5 font-mono text-xs font-bold text-foreground">
                        {n(d.stats.performance_score)}
                        <span className="text-[10px] text-muted-foreground">/100</span>
                      </span>
                    ) : (
                      <span className="shrink-0 rounded-full border border-border bg-surface-muted px-2 py-0.5 text-[10px] text-muted-foreground">
                        {t("newDept")}
                      </span>
                    )}
                  </div>

                  <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                    {desc}
                  </p>

                  {/* Categories */}
                  <div className="flex flex-wrap gap-1">
                    {d.categories.slice(0, 3).map((cat) => (
                      <CategoryChip key={cat} category={cat} />
                    ))}
                    {d.categories.length > 3 && (
                      <span className="text-[10px] text-muted-foreground self-center">
                        +{d.categories.length - 3}
                      </span>
                    )}
                  </div>

                  {/* Contact & Hours Quick Strip */}
                  <div className="rounded-xl border border-border/80 bg-surface-muted/40 p-2.5 space-y-1.5 text-xs text-muted-foreground">
                    <div className="flex items-center gap-2 truncate">
                      <MapPin className="size-3.5 shrink-0 text-subtle-foreground" strokeWidth={1.75} />
                      <span className="truncate">{location}</span>
                    </div>
                    <div className="flex items-center gap-2 truncate">
                      <Phone className="size-3.5 shrink-0 text-subtle-foreground" strokeWidth={1.75} />
                      <span className="truncate font-mono text-[11px]">{d.contact_phone}</span>
                    </div>
                    <div className="flex items-center gap-2 truncate">
                      <Clock className="size-3.5 shrink-0 text-subtle-foreground" strokeWidth={1.75} />
                      <span className="truncate text-[11px]">{hours}</span>
                    </div>
                  </div>

                  {/* Performance Indicators */}
                  <div className="grid grid-cols-3 gap-2 border-t border-border pt-3 text-center">
                    <div>
                      <span className="block font-mono text-xs font-bold text-foreground">
                        {n(d.stats.sla_compliance_pct)}%
                      </span>
                      <span className="block text-[10px] text-muted-foreground">{t("slaLabel")}</span>
                    </div>
                    <div>
                      <span className="block font-mono text-xs font-bold text-foreground">
                        {n(d.stats.resolved_count)}
                      </span>
                      <span className="block text-[10px] text-muted-foreground">{t("resolvedLabel")}</span>
                    </div>
                    <div>
                      <span className="inline-flex items-center justify-center gap-0.5 font-mono text-xs font-bold text-foreground">
                        {d.stats.user_rating_avg ? n(d.stats.user_rating_avg) : "—"}
                        {d.stats.user_rating_avg && <Star className="size-3 fill-foreground text-foreground" />}
                      </span>
                      <span className="block text-[10px] text-muted-foreground">{t("ratingLabel")}</span>
                    </div>
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-border">
                  <Link
                    href={`/departments/${d.id}`}
                    className={cn(buttonVariants({ variant: "secondary", size: "sm" }), "w-full justify-between")}
                  >
                    <span>{t("viewDetails")}</span>
                    <ChevronRight className="size-3.5" />
                  </Link>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
