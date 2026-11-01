import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { GuideClient } from "./guide-client";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("guide");
  return {
    title: `${t("title")} · CivicSense`,
    description: t("subtitle"),
  };
}

export default async function GuidePage() {
  const locale = await getLocale();

  return (
    <div className="mx-auto max-w-4xl py-2 sm:py-6">
      <GuideClient locale={locale} />
    </div>
  );
}
