import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { VoiceClient } from "./voice-client";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("voice");
  return {
    title: `${t("title")} · CivicSense`,
    description: t("subtitle"),
  };
}

export default async function VoiceReportPage() {
  const locale = await getLocale();

  return (
    <div className="mx-auto max-w-3xl py-2 sm:py-6">
      <VoiceClient locale={locale} />
    </div>
  );
}
