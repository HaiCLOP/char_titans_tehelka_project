import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { StaffQueue } from "@/components/staff/staff-queue";
import { requireRole } from "@/lib/auth";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("nav.admin");
  return { title: `${t("fieldWork")} — ${t("title")}` };
}

export default async function AdminFieldWorkPage() {
  const { user } = await requireRole("dept_admin", "super_admin");
  return <StaffQueue userId={user.id} isAdmin />;
}
