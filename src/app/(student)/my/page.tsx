import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { requireUser } from "@/lib/auth";
import { MyReports } from "@/components/ticket/my-reports";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("my");
  return { title: t("metaTitle") };
}

// S07 — My reports (live status via Supabase Realtime).
export default async function MyReportsPage() {
  const { user } = await requireUser();
  return <MyReports userId={user.id} />;
}
