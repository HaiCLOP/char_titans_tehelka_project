import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Workspace } from "@/components/admin/workspace";
import { requireRole } from "@/lib/auth";
import type { NamedRef } from "@/lib/domain";
import { createClient } from "@/lib/supabase/server";
import { getComplaintDetail } from "@/lib/tracking";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("workspace");
  return { title: t("metaTitle") };
}

// S15 — Admin ticket workspace. Only admins of the ticket's department (or super admin); anything else is 404.
export default async function WorkspacePage({ params }: PageProps<"/admin/t/[id]">) {
  const { id } = await params;
  const { user, profile } = await requireRole("dept_admin", "super_admin");
  const supabase = await createClient();
  const [detail, depts] = await Promise.all([
    getComplaintDetail(supabase, { id: user.id, profile }, decodeURIComponent(id)),
    supabase.from("departments").select("id, name_en, name_as").order("name_en"),
  ]);
  if (!detail?.admin) notFound();
  return <Workspace initial={detail} departments={(depts.data ?? []) as NamedRef[]} isSuper={profile.role === "super_admin"} />;
}
