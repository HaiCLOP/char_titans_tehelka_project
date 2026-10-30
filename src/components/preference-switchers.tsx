"use client";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Moon, Sun, Palette } from "lucide-react";
import { LOCALE_COOKIE } from "@/i18n/config";
import { THEMES, THEME_COOKIE, MODE_COOKIE, type Theme } from "@/lib/theme";
import { cn, setCookie } from "@/lib/utils";

const withTransition = (fn: () => void) => {
  const d = document as Document & { startViewTransition?: (cb: () => void) => void };
  if (d.startViewTransition) d.startViewTransition(fn);
  else fn();
};

export function LanguageSwitch() {
  const locale = useLocale();
  const router = useRouter();
  const [pending, start] = useTransition();
  const t = useTranslations("header");
  const set = (l: "en" | "as") => {
    if (l === locale) return;
    setCookie(LOCALE_COOKIE, l);
    start(() => router.refresh());
  };
  return (
    <div role="group" aria-label={t("language")} className={cn("flex rounded-full border border-border bg-surface p-1 text-sm", pending && "opacity-60")}>
      {(["en", "as"] as const).map((l) => (
        <button
          key={l}
          onClick={() => set(l)}
          className={cn("rounded-full px-3 py-1 transition", locale === l ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}
        >
          {l === "en" ? "English" : "অসমীয়া"}
        </button>
      ))}
    </div>
  );
}

const THEME_SWATCH: Record<Theme, string> = { tea: "#0f5a43", brahmaputra: "#12497a", muga: "#b8862b" };

export function ThemeSwitch() {
  const t = useTranslations("header");
  const setTheme = (th: Theme) =>
    withTransition(() => {
      document.documentElement.dataset.theme = th;
      setCookie(THEME_COOKIE, th);
    });
  const toggleMode = () =>
    withTransition(() => {
      const dark = document.documentElement.classList.toggle("dark");
      setCookie(MODE_COOKIE, dark ? "dark" : "light");
    });
  return (
    <div className="flex items-center gap-1 rounded-full border border-border bg-surface p-1" aria-label={t("theme")}>
      <Palette className="mx-1 size-4 text-muted-foreground" aria-hidden />
      {THEMES.map((th) => (
        <button key={th} onClick={() => setTheme(th)} aria-label={th} className="size-5 rounded-full ring-offset-2 hover:ring-2 hover:ring-ring" style={{ background: THEME_SWATCH[th] }} />
      ))}
      <button onClick={toggleMode} aria-label="dark mode" className="ml-1 rounded-full p-1 text-muted-foreground hover:text-foreground">
        <Sun className="size-4 dark:hidden" />
        <Moon className="hidden size-4 dark:block" />
      </button>
    </div>
  );
}
