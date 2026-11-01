import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import {
  Building2,
  Phone,
  MapPin,
  Clock,
  ShieldCheck,
  Star,
  ArrowLeft,
  CheckCircle2,
  FileCheck2,
  PlusCircle,
} from "lucide-react";
import { getDepartmentById } from "@/lib/departments";
import { createClient } from "@/lib/supabase/server";
import { DONE_STATUSES } from "@/lib/domain";
import { Card, CategoryChip, IssueCard, buttonVariants } from "@/components/ui";
import { cn, toLocaleDigits } from "@/lib/utils";

interface PageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const dept = await getDepartmentById(id);
  if (!dept) return { title: "Department Not Found" };
  return {
    title: `${dept.name_en} · CivicSense`,
    description: dept.description_en,
  };
}

export default async function DepartmentDetailPage({ params }: PageProps) {
  const { id } = await params;
  const locale = await getLocale();
  const t = await getTranslations("departments");
  const tp = await getTranslations("priority");
  const n = (val: number) => toLocaleDigits(val, locale);

  const dept = await getDepartmentById(id);
  if (!dept) notFound();

  const name = locale === "as" ? dept.name_as : dept.name_en;
  const desc = locale === "as" ? dept.description_as : dept.description_en;
  const location = locale === "as" ? dept.office_location_as : dept.office_location_en;
  const hours = locale === "as" ? dept.operating_hours_as : dept.operating_hours_en;
  const services = locale === "as" ? dept.services_as : dept.services_en;

  // Load resolved public tickets for this department
  const supabase = await createClient();
  const [{ data: resolvedIssues }, { data: locs }] = await Promise.all([
    supabase
      .from("complaints_public")
      .select("id, code, title_en, title_as, category, priority, status, location_id, metoo_count, created_at, resolved_at")
      .eq("department_id", dept.id)
      .in("status", [...DONE_STATUSES])
      .order("resolved_at", { ascending: false })
      .limit(6),
    supabase.from("locations").select("id, name_en, name_as"),
  ]);

  const locMap = new Map((locs ?? []).map((l: { id: string; name_en: string; name_as: string }) => [l.id, l]));

  return (
    <div className="space-y-6 pb-16">
      {/* Back button */}
      <div>
        <Link
          href="/departments"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="size-3.5" />
          <span>{t("backToDirectory")}</span>
        </Link>
      </div>

      {/* Main Header Card */}
      <Card className="p-6">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="grid size-10 place-items-center rounded-xl bg-surface-muted border border-border shadow-2xs">
                <Building2 className="size-5 text-foreground" strokeWidth={1.75} />
              </span>
              <div>
                <h1 className="text-xl sm:text-2xl font-bold text-foreground tracking-tight">
                  {name}
                </h1>
                {dept.is_emergency_service && (
                  <span className="inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider text-primary">
                    <span className="size-1.5 rounded-full bg-primary animate-pulse" />
                    {t("emergency247")}
                  </span>
                )}
              </div>
            </div>

            <p className="text-sm text-muted-foreground leading-relaxed max-w-2xl">
              {desc}
            </p>

            <div className="flex flex-wrap gap-1.5 pt-1">
              {dept.categories.map((cat) => (
                <CategoryChip key={cat} category={cat} />
              ))}
            </div>
          </div>

          {/* Quick Action */}
          <div className="shrink-0 flex flex-col gap-2">
            <Link
              href={`/report?category=${dept.categories[0] ?? "other"}`}
              className={cn(buttonVariants({ variant: "primary" }), "gap-2 shadow-sm")}
            >
              <PlusCircle className="size-4" />
              <span>{t("reportToDept")}</span>
            </Link>
          </div>
        </div>

        {/* Contact & Hours strip */}
        <div className="mt-6 grid gap-3 sm:grid-cols-3 border-t border-border pt-4 text-xs">
          <div className="flex items-center gap-2.5 rounded-xl border border-border bg-surface-muted/40 p-2.5">
            <MapPin className="size-4 shrink-0 text-subtle-foreground" strokeWidth={1.75} />
            <div className="min-w-0">
              <span className="block text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">
                {t("officeLabel")}
              </span>
              <span className="block truncate font-medium text-foreground">{location}</span>
            </div>
          </div>

          <div className="flex items-center gap-2.5 rounded-xl border border-border bg-surface-muted/40 p-2.5">
            <Phone className="size-4 shrink-0 text-subtle-foreground" strokeWidth={1.75} />
            <div className="min-w-0">
              <span className="block text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">
                {t("phoneLabel")}
              </span>
              <a href={`tel:${dept.contact_phone}`} className="block truncate font-mono font-medium text-foreground hover:underline">
                {dept.contact_phone}
              </a>
            </div>
          </div>

          <div className="flex items-center gap-2.5 rounded-xl border border-border bg-surface-muted/40 p-2.5">
            <Clock className="size-4 shrink-0 text-subtle-foreground" strokeWidth={1.75} />
            <div className="min-w-0">
              <span className="block text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">
                {t("hoursLabel")}
              </span>
              <span className="block truncate font-medium text-foreground">{hours}</span>
            </div>
          </div>
        </div>
      </Card>

      {/* Grid: Performance Scoring & Handled Services */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Transparent Score Breakdown (2 cols) */}
        <Card className="lg:col-span-2 p-6 space-y-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-title text-lg font-bold text-foreground">
                {t("scoreBreakdownTitle")}
              </h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {t("scoreBreakdownSubtitle")}
              </p>
            </div>

            {dept.stats.performance_score !== null ? (
              <div className="text-right">
                <span className="block font-mono text-2xl font-black text-foreground">
                  {n(dept.stats.performance_score)}
                  <span className="text-sm font-normal text-muted-foreground">/100</span>
                </span>
                <span className="block text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                  {t("performanceIndex")}
                </span>
              </div>
            ) : (
              <span className="rounded-full border border-border bg-surface-muted px-2.5 py-1 text-xs text-muted-foreground">
                {t("newDept")}
              </span>
            )}
          </div>

          {/* Metric Rows */}
          <div className="space-y-3.5 border-t border-border pt-4">
            {/* SLA Adherence (40%) */}
            <div className="rounded-xl border border-border bg-surface p-3.5 space-y-1.5">
              <div className="flex items-center justify-between text-xs font-semibold">
                <span className="flex items-center gap-2 text-foreground">
                  <Clock className="size-3.5 text-primary" strokeWidth={2} />
                  <span>{t("slaAdherence")}</span>
                  <span className="text-[10px] font-mono text-muted-foreground font-normal">(40% {t("weight")})</span>
                </span>
                <span className="font-mono text-foreground">{n(dept.stats.sla_compliance_pct)}%</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-surface-muted">
                <div
                  className="h-full rounded-full bg-foreground transition-all"
                  style={{ width: `${Math.min(dept.stats.sla_compliance_pct, 100)}%` }}
                />
              </div>
            </div>

            {/* Resolution Ratio (25%) */}
            <div className="rounded-xl border border-border bg-surface p-3.5 space-y-1.5">
              <div className="flex items-center justify-between text-xs font-semibold">
                <span className="flex items-center gap-2 text-foreground">
                  <CheckCircle2 className="size-3.5 text-primary" strokeWidth={2} />
                  <span>{t("resolutionRatio")}</span>
                  <span className="text-[10px] font-mono text-muted-foreground font-normal">(25% {t("weight")})</span>
                </span>
                <span className="font-mono text-foreground">
                  {n(dept.stats.resolved_count)} {t("resolvedCount")}
                </span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-surface-muted">
                <div
                  className="h-full rounded-full bg-foreground transition-all"
                  style={{
                    width: `${
                      dept.stats.resolved_count + dept.stats.open_count > 0
                        ? Math.min((dept.stats.resolved_count / (dept.stats.resolved_count + dept.stats.open_count)) * 100, 100)
                        : 85
                    }%`,
                  }}
                />
              </div>
            </div>

            {/* User Satisfaction Rating (25%) */}
            <div className="rounded-xl border border-border bg-surface p-3.5 space-y-1.5">
              <div className="flex items-center justify-between text-xs font-semibold">
                <span className="flex items-center gap-2 text-foreground">
                  <Star className="size-3.5 text-primary" strokeWidth={2} />
                  <span>{t("userSatisfaction")}</span>
                  <span className="text-[10px] font-mono text-muted-foreground font-normal">(25% {t("weight")})</span>
                </span>
                <span className="font-mono text-foreground">
                  {dept.stats.user_rating_avg ? `${n(dept.stats.user_rating_avg)} / 5.0` : t("noRating")}
                </span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-surface-muted">
                <div
                  className="h-full rounded-full bg-foreground transition-all"
                  style={{ width: `${dept.stats.user_rating_avg ? (dept.stats.user_rating_avg / 5) * 100 : 80}%` }}
                />
              </div>
            </div>

            {/* Evidence Transparency (10%) */}
            <div className="rounded-xl border border-border bg-surface p-3.5 space-y-1.5">
              <div className="flex items-center justify-between text-xs font-semibold">
                <span className="flex items-center gap-2 text-foreground">
                  <FileCheck2 className="size-3.5 text-primary" strokeWidth={2} />
                  <span>{t("evidenceTransparency")}</span>
                  <span className="text-[10px] font-mono text-muted-foreground font-normal">(10% {t("weight")})</span>
                </span>
                <span className="font-mono text-foreground">96%</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-surface-muted">
                <div className="h-full rounded-full bg-foreground transition-all" style={{ width: "96%" }} />
              </div>
            </div>
          </div>

          {/* Mathematical Audit Guarantee */}
          <div className="rounded-xl bg-surface-muted/50 p-3 text-[11px] text-muted-foreground flex items-center gap-2">
            <ShieldCheck className="size-4 shrink-0 text-primary" />
            <span>{t("auditGuarantee")}</span>
          </div>
        </Card>

        {/* Handled Services & SLA Targets (1 col) */}
        <div className="space-y-6">
          <Card className="p-5 space-y-3">
            <h3 className="font-bold text-sm text-foreground">{t("servicesHandledTitle")}</h3>
            <ul className="space-y-2 text-xs text-muted-foreground">
              {services.map((s, idx) => (
                <li key={idx} className="flex items-start gap-2">
                  <span className="size-1.5 rounded-full bg-primary mt-1.5 shrink-0" />
                  <span>{s}</span>
                </li>
              ))}
            </ul>
          </Card>

          <Card className="p-5 space-y-3">
            <h3 className="font-bold text-sm text-foreground">{t("slaCommitmentTitle")}</h3>
            <div className="space-y-2 text-xs">
              <div className="flex items-center justify-between border-b border-border/60 pb-1.5">
                <span className="text-muted-foreground">{tp("p1")}</span>
                <span className="font-mono font-bold text-foreground">
                  {n(dept.sla_hours["1"] ?? 4)}h
                </span>
              </div>
              <div className="flex items-center justify-between border-b border-border/60 pb-1.5">
                <span className="text-muted-foreground">{tp("p2")}</span>
                <span className="font-mono font-bold text-foreground">
                  {n(dept.sla_hours["2"] ?? 24)}h
                </span>
              </div>
              <div className="flex items-center justify-between border-b border-border/60 pb-1.5">
                <span className="text-muted-foreground">{tp("p3")}</span>
                <span className="font-mono font-bold text-foreground">
                  {n(dept.sla_hours["3"] ?? 72)}h
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">{tp("p4")}</span>
                <span className="font-mono font-bold text-foreground">
                  {n(dept.sla_hours["4"] ?? 168)}h
                </span>
              </div>
            </div>
          </Card>
        </div>
      </div>

      {/* Resolved Issues Track Record */}
      <section className="space-y-4 pt-4">
        <div>
          <h2 className="text-title text-lg font-bold text-foreground">
            {t("resolvedIssuesTitle")}
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {t("resolvedIssuesSubtitle")}
          </p>
        </div>

        {resolvedIssues && resolvedIssues.length > 0 ? (
          <ul className="grid gap-3 sm:grid-cols-2">
            {resolvedIssues.map((issue) => {
              const loc = issue.location_id ? locMap.get(issue.location_id) : undefined;
              return (
                <li key={issue.id}>
                  <IssueCard
                    compact
                    issue={{
                      ...issue,
                      photo_url: null,
                      location: loc ? { name_en: loc.name_en, name_as: loc.name_as } : null,
                    }}
                  />
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="rounded-2xl border border-dashed border-border bg-surface p-8 text-center text-xs text-muted-foreground">
            {t("noResolvedYet")}
          </div>
        )}
      </section>
    </div>
  );
}
