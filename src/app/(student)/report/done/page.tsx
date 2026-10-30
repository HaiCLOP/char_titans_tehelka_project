import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { requireUser } from "@/lib/auth";
import { getComplaintDetail } from "@/lib/tracking";
import { createClient } from "@/lib/supabase/server";
import { DoneView } from "@/components/report/done-view";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("done");
  return { title: t("metaTitle") };
}

// S06 — Submitted. Reads the ticket back through RLS so only its reporter (or staff) sees it.
export default async function DonePage({ searchParams }: PageProps<"/report/done">) {
  const { user, profile } = await requireUser();
  const raw = (await searchParams).id;
  const id = Array.isArray(raw) ? raw[0] : raw;
  if (!id) notFound();
  const supabase = await createClient();
  const detail = await getComplaintDetail(supabase, { id: user.id, profile }, id);
  if (!detail) notFound();
  return (
    <DoneView
      id={detail.id}
      code={detail.code}
      department={detail.department}
      slaDueAt={detail.sla_due_at}
      status={detail.status}
      isUrgent={detail.is_urgent}
    />
  );
}
