import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { MembersPanel } from "@/components/admin/departments";
import { EmptyState } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import type { NamedRef } from "@/lib/domain";
import { listDepartments } from "@/lib/org";
import { createClient } from "@/lib/supabase/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("nav.admin");
  return { title: `${t("team")} — ${t("title")}` };
}

// A department admin's own team: add field staff by email, set skills and buildings, see their experience.
export default async function TeamPage() {
  const { profile } = await requireRole("dept_admin");
  const t = await getTranslations("members");
  const supabase = await createClient();
  const [departments, locs] = await Promise.all([
    listDepartments(supabase),
    supabase.from("locations").select("id, name_en, name_as").order("name_en"),
  ]);
  const mine = departments.find((d) => d.id === profile.department_id);
  if (!mine) return <EmptyState className="mx-auto mt-8 max-w-xl" title={t("noDepartmentTitle")} body={t("noDepartmentBody")} />;
  return (
    <div className="mx-auto max-w-4xl">
      <MembersPanel department={mine} departments={[mine]} locations={(locs.data ?? []) as NamedRef[]} limited />
    </div>
  );
}
