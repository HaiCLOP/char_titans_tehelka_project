import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { LayoutDashboard } from "lucide-react";
import { EmptyState } from "@/components/ui/states";
import { requireRole } from "@/lib/auth";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("nav.admin");
  return { title: `${t("dashboard")} — ${t("title")}` };
}

/** S13 placeholder until M5. */
export default async function AdminHome() {
  await requireRole("dept_admin", "super_admin");
  const t = await getTranslations("ui.comingSoon");
  return (
    <div className="py-6">
      <EmptyState icon={LayoutDashboard} title={t("title")} body={t("adminBody")} />
    </div>
  );
}
