import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { GraduationCap, LayoutDashboard, Search } from "lucide-react";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { Avatar, buttonVariants } from "@/components/ui";
import { LanguageSwitch, ModeToggle } from "@/components/preference-switchers";
import { getProfile, getUser } from "@/lib/auth";
import { BrandMark } from "./brand-mark";

/** Slim top bar: campus context chip, search, language, mode, notifications, account. */
export async function Header() {
  const [t, user, profile] = await Promise.all([getTranslations(), getUser(), getProfile()]);
  const role = profile?.role ?? "guest";
  const name = profile?.full_name || user?.email || "";

  return (
    <header className="sticky top-0 z-20 border-b border-border bg-surface/90 px-3 backdrop-blur-md supports-[backdrop-filter]:bg-surface/75 sm:px-6 lg:pr-10 lg:pl-[7.5rem]">
      <div className="flex h-16 items-center gap-2 sm:gap-3">
        <Link href="/" aria-label={t("shell.home")} className="flex shrink-0 items-center gap-2 lg:hidden">
          <BrandMark className="size-8 rounded-xl shadow-xs" />
          <span className="hidden font-bold text-base tracking-tight sm:inline">CivicSense</span>
        </Link>

        <div className="hidden h-9 items-center gap-2 rounded-full border border-border/80 bg-surface-muted/50 px-3 text-xs font-medium xl:flex">
          <GraduationCap className="size-3.5 text-primary" strokeWidth={2} aria-hidden />
          <span className="font-semibold">{t("shell.university")}</span>
          <span className="text-muted-foreground/60 font-normal">·</span>
          <span className="text-muted-foreground">{t(`roles.${role}`)}</span>
        </div>

        <form action="/my" role="search" className="hidden h-10 min-w-0 flex-1 items-center gap-2.5 rounded-xl border border-border bg-surface-muted/60 px-3.5 text-sm transition-colors focus-within:border-border-strong focus-within:bg-surface sm:flex sm:max-w-xs md:max-w-sm lg:max-w-md">
          <Search className="size-4 shrink-0 text-subtle-foreground" strokeWidth={1.75} aria-hidden />
          <input
            type="search"
            name="q"
            aria-label={t("header.search")}
            placeholder={t("header.search")}
            className="min-w-0 flex-1 bg-transparent outline-none text-sm"
          />
          <kbd className="hidden rounded-md border border-border bg-surface px-1.5 py-0.5 font-sans text-[11px] text-muted-foreground lg:inline">⌘K</kbd>
        </form>

        <div className="ml-auto flex shrink-0 items-center gap-1 sm:gap-1.5">
          <LanguageSwitch />
          <ModeToggle />
          {user ? (
            <>
              {(role === "dept_admin" || role === "super_admin") && (
                <Link href="/admin" className={buttonVariants({ variant: "secondary", size: "sm", className: "mr-0.5 sm:mr-1" })}>
                  <LayoutDashboard strokeWidth={1.75} aria-hidden />
                  <span className="hidden md:inline">{t("nav.adminPanel")}</span>
                  <span className="sr-only md:hidden">{t("nav.adminPanel")}</span>
                </Link>
              )}
              <NotificationBell userId={user.id} />
              <Link href="/profile" aria-label={t("shell.openProfile")} className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <Avatar name={name} src={profile?.avatar_url} size="md" decorative className="ring-1 ring-border" />
              </Link>
            </>
          ) : (
            <Link href="/login" className={buttonVariants({ variant: "primary", size: "sm", className: "px-3 sm:px-4 text-xs sm:text-sm" })}>{t("shell.signIn")}</Link>
          )}
        </div>
      </div>
    </header>
  );
}
