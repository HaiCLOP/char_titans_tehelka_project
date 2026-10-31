import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ArrowLeft } from "lucide-react";
import { BrandMark } from "@/components/shell/brand-mark";
import { SysNav } from "@/components/system/sys-nav";
import { requireSysPage } from "@/lib/sys";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("sys");
  return { title: `${t("meta")} — CivicSense`, robots: { index: false, follow: false } };
}

/**
 * System panel (S20–S23): minimal dark admin layout. Only reachable through the secret path rewrite
 * in src/proxy.ts; every page repeats the check (layouts do not re-run on client navigation).
 * `.dark` on this wrapper forces the dark tokens for this layout only.
 */
export default async function SysLayout({ children }: { children: React.ReactNode }) {
  const { base } = await requireSysPage();
  const t = await getTranslations("sys.nav");
  return (
    <div className="dark min-h-dvh bg-background text-foreground [color-scheme:dark]">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-2.5">
            <BrandMark className="size-8 rounded-xl" />
            <span className="text-title text-[0.9375rem]">{t("title")}</span>
          </div>
          <SysNav base={base} />
          <Link
            href="/admin"
            className="ml-auto inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-4" strokeWidth={1.75} aria-hidden />
            {t("backToAdmin")}
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 pt-8 pb-16 sm:px-6">{children}</main>
    </div>
  );
}
