"use client";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Moon, Sun } from "lucide-react";
import { LOCALE_COOKIE } from "@/i18n/config";
import { MODE_COOKIE } from "@/lib/theme";
import { cn, setCookie } from "@/lib/utils";

const withTransition = (fn: () => void) => {
  const d = document as Document & { startViewTransition?: (cb: () => void) => void };
  if (d.startViewTransition) d.startViewTransition(fn);
  else fn();
};

/** Segmented EN / অসমীয়া control. Compact on mobile (EN/অস), full on sm+. */
export function LanguageSwitch({ className }: { className?: string }) {
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
    <div role="group" aria-label={t("language")} className={cn("inline-flex h-9 sm:h-10 items-center rounded-full bg-surface-muted p-0.5 sm:p-1 text-xs sm:text-[13px]", pending && "opacity-60", className)}>
      {(["en", "as"] as const).map((l) => (
        <button
          key={l}
          type="button"
          onClick={() => set(l)}
          aria-pressed={locale === l}
          lang={l}
          className={cn(
            "h-7 sm:h-8 rounded-full px-2.5 sm:px-3 font-medium transition-[background-color,color,box-shadow] duration-200",
            locale === l ? "bg-surface text-foreground shadow-sm ring-1 ring-border" : "text-muted-foreground hover:text-foreground",
          )}
        >
          <span className="sm:hidden">{l === "en" ? "EN" : "অস"}</span>
          <span className="hidden sm:inline">{l === "en" ? "English" : "অসমীয়া"}</span>
        </button>
      ))}
    </div>
  );
}

/** Light / dark. The only theme choice: the product is monochrome by design. */
export function ModeToggle() {
  const t = useTranslations("header");
  const toggle = () =>
    withTransition(() => {
      const dark = document.documentElement.classList.toggle("dark");
      setCookie(MODE_COOKIE, dark ? "dark" : "light");
    });
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={t("darkMode")}
      className="grid size-10 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-surface-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <Moon className="size-[18px] dark:hidden" strokeWidth={1.75} aria-hidden />
      <Sun className="hidden size-[18px] dark:block" strokeWidth={1.75} aria-hidden />
    </button>
  );
}

/** @deprecated Colour themes were removed; kept as an alias so older imports keep compiling. */
export const ThemeSwitch = ModeToggle;
