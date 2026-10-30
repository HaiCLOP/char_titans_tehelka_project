import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { requireUser } from "@/lib/auth";
import { getComplaintDetail } from "@/lib/tracking";
import { createClient } from "@/lib/supabase/server";
import { TicketView } from "@/components/ticket/ticket-view";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("ticket");
  return { title: t("metaTitle") };
}

// S08 — Ticket detail. Anything RLS hides is a plain 404 (PRD NEG2), so private tickets are never revealed.
export default async function TicketPage({ params }: PageProps<"/c/[id]">) {
  const { id } = await params;
  const { user, profile } = await requireUser();
  const supabase = await createClient();
  const detail = await getComplaintDetail(supabase, { id: user.id, profile }, decodeURIComponent(id));
  if (!detail) notFound();
  return <TicketView initial={detail} />;
}
