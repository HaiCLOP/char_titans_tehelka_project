import { getTranslations } from "next-intl/server";
import { Bell, Search } from "lucide-react";
import { LanguageSwitch, ThemeSwitch } from "@/components/preference-switchers";

export async function Header() {
  const t = await getTranslations("header");
  return (
    <header className="flex flex-wrap items-center gap-3 py-4">
      <label className="flex min-w-0 flex-1 items-center gap-2 rounded-full border border-border bg-surface px-4 py-2.5 text-sm text-muted-foreground shadow-sm">
        <Search className="size-4 shrink-0" aria-hidden />
        <input placeholder={t("search")} className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-muted-foreground" />
        <kbd className="hidden rounded-md bg-surface-muted px-1.5 text-xs sm:inline">⌘K</kbd>
      </label>
      <LanguageSwitch />
      <ThemeSwitch />
      <button aria-label="notifications" className="relative grid size-10 place-items-center rounded-full border border-border bg-surface">
        <Bell className="size-4" />
        <span className="absolute right-2.5 top-2 size-2 rounded-full bg-p1" />
      </button>
    </header>
  );
}
