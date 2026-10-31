import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { requireUser } from "@/lib/auth";
import { ReportForm } from "@/components/report/report-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("report");
  return { title: t("metaTitle") };
}

// S05 — Report an issue (PRD section 7). Signed-in students and staff only.
export default async function ReportPage({
  searchParams,
}: {
  searchParams: Promise<{ location?: string; category?: string }>;
}) {
  await requireUser();
  const sp = await searchParams;
  return <ReportForm initialLocationId={sp.location} initialCategory={sp.category} />;
}
