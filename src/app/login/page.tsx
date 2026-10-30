import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ShieldCheck } from "lucide-react";
import { LanguageSwitch, ThemeSwitch } from "@/components/preference-switchers";
import { afterLoginPath, getProfile, getUser, safeNext } from "@/lib/auth";
import { LoginForm } from "./login-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth");
  return { title: t("metaTitle") };
}

type Props = { searchParams: Promise<{ next?: string | string[]; error?: string | string[] }> };

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function LoginPage({ searchParams }: Props) {
  const sp = await searchParams;
  const next = safeNext(first(sp.next));

  if (await getUser()) redirect(afterLoginPath(await getProfile(), next));

  const t = await getTranslations();
  return (
    <main className="flex min-h-dvh flex-col bg-background px-4 py-4 sm:px-8">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <LanguageSwitch />
        <ThemeSwitch />
      </div>

      <div className="flex flex-1 items-center justify-center py-8">
        <div className="w-full max-w-sm">
          <div className="mb-6 text-center">
            <span className="mx-auto grid size-12 place-items-center rounded-full bg-primary-soft text-primary">
              <ShieldCheck className="size-6" aria-hidden />
            </span>
            <p className="mt-3 text-xs uppercase tracking-[0.3em] text-muted-foreground">{t("app.name")}</p>
            <h1 className="mt-2 text-2xl font-bold tracking-tight">{t("auth.title")}</h1>
            <p className="mt-2 text-sm text-muted-foreground">{t("auth.subtitle")}</p>
          </div>

          <div className="rounded-card border border-border bg-surface p-5 shadow-sm">
            <LoginForm next={next} callbackError={first(sp.error) === "callback"} />
          </div>

          <p className="mt-4 text-center text-xs text-muted-foreground">{t("auth.privacy")}</p>
        </div>
      </div>
    </main>
  );
}
