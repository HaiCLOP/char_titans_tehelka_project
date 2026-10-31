import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { DepartmentsView } from "@/components/admin/departments";
import { requireRole } from "@/lib/auth";
import type { NamedRef } from "@/lib/domain";
import { createClient } from "@/lib/supabase/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("nav.admin");
  return { title: `${t("departments")} — ${t("title")}` };
}

// S18 — Departments + members (super admin only; everyone else is sent to their role home).
export default async function DepartmentsPage() {
  await requireRole("super_admin");
  const supabase = await createClient();
  const { data } = await supabase.from("locations").select("id, name_en, name_as").order("name_en");
  return <DepartmentsView locations={(data ?? []) as NamedRef[]} />;
}
