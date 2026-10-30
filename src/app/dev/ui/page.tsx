import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LanguageSwitch, ThemeSwitch } from "@/components/preference-switchers";
import { Gallery } from "./gallery";

export const metadata: Metadata = { title: "UI kit — dev", robots: { index: false } };

/** Dev-only component gallery (404 in production). Labels here are component names, not user copy. */
export default function DevUiPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <main className="mx-auto max-w-6xl px-4 py-6 sm:px-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">UI kit</h1>
        <div className="flex flex-wrap gap-2">
          <LanguageSwitch />
          <ThemeSwitch />
        </div>
      </div>
      <Gallery />
    </main>
  );
}
