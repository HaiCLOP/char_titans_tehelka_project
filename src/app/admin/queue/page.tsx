import type { Metadata } from "next";
import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import { QueueView } from "@/components/admin/queue";
import { EmptyState, ListSkeleton } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import type { NamedRef } from "@/lib/domain";
import { createClient } from "@/lib/supabase/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("nav.admin");
  return { title: `${t("queue")} — ${t("title")}` };
}

// S14 — Triage queue (dept_admin: own department; super_admin: all + department filter).
export default async function QueuePage() {
  const { profile } = await requireRole("dept_admin", "super_admin");
  const isSuper = profile.role === "super_admin";
  if (!isSuper && !profile.department_id) {
    const t = await getTranslations("admin");
    return <EmptyState className="mt-6" title={t("noDeptTitle")} body={t("noDeptBody")} />;
  }
  const supabase = await createClient();
  const { data } = isSuper ? await supabase.from("departments").select("id, name_en, name_as").order("name_en") : { data: [] };
  return (
    <Suspense fallback={<ListSkeleton rows={6} />}>
      <QueueView isSuper={isSuper} departmentId={profile.department_id} departments={(data ?? []) as NamedRef[]} />
    </Suspense>
  );
}
