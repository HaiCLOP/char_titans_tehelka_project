import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { StaffQueue } from "@/components/staff/staff-queue";
import { requireRole } from "@/lib/auth";
import { redirect } from "next/navigation";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("staff");
  return { title: t("metaTitle") };
}

// S12 — My assigned work. Field staff land here after sign-in; admins can open it from the sidebar.
export default async function StaffPage() {
  const { user, profile } = await requireRole("field_staff", "dept_admin", "super_admin");
  if (profile.role !== "field_staff") redirect("/admin/field-work");
  return <StaffQueue userId={user.id} isAdmin={profile.role !== "field_staff"} />;
}
