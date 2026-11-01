import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { requireUser } from "@/lib/auth";
import { ChatReport } from "@/components/report/chat-report";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("reportChat");
  return { title: t("metaTitle") };
}

// "Tell Civi what happened": chat → report draft → the student submits (S05 alternative entry).
export default async function ReportChatPage() {
  await requireUser();
  return <ChatReport />;
}
