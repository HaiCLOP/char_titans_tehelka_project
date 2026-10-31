import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Compass } from "lucide-react";
import { buttonVariants } from "@/components/ui";

// S24 — bilingual 404.
export default async function NotFound() {
  const t = await getTranslations("errors");
  return (
    <main className="grid min-h-dvh place-items-center bg-background px-4 py-10">
      <div className="w-full max-w-md rounded-card border border-border bg-surface p-8 text-center shadow-sm">
        <Compass className="mx-auto size-9 text-subtle-foreground" strokeWidth={1.5} aria-hidden />
        <p className="tabular mt-5 text-sm font-medium text-muted-foreground">404</p>
        <h1 className="text-display mt-2 text-[2rem]">{t("notFoundTitle")}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{t("notFoundBody")}</p>
        <Link href="/" className={buttonVariants({ className: "mt-6" })}>
          {t("goHome")}
        </Link>
      </div>
    </main>
  );
}
