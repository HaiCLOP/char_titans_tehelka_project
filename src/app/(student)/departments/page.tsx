import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Building2 } from "lucide-react";
import { getPublicDepartmentDirectory } from "@/lib/departments";
import { DepartmentsClient } from "@/components/departments/departments-client";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("departments");
  return {
    title: t("title"),
    description: t("subtitle"),
  };
}

export default async function DepartmentsPage() {
  const t = await getTranslations("departments");
  const departments = await getPublicDepartmentDirectory();

  return (
    <div className="space-y-6 pb-12">
      {/* Page Header */}
      <div>
        <div className="flex items-center gap-2 text-primary">
          <Building2 className="size-5" strokeWidth={1.75} />
          <span className="text-xs font-bold uppercase tracking-wider">{t("tag")}</span>
        </div>
        <h1 className="mt-1 text-title text-2xl sm:text-3xl font-extrabold text-foreground tracking-tight">
          {t("title")}
        </h1>
        <p className="mt-1.5 text-sm text-muted-foreground max-w-2xl leading-relaxed">
          {t("subtitle")}
        </p>
      </div>

      <DepartmentsClient departments={departments} />
    </div>
  );
}

