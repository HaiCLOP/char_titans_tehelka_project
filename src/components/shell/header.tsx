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
    <header className="sticky top-0 z-20 border-b border-border bg-surface/90 px-4 backdrop-blur-md supports-[backdrop-filter]:bg-surface/75 sm:px-8 lg:pr-8 lg:pl-72">
      <div className="flex h-16 items-center gap-3">
        <Link href="/" aria-label={t("shell.home")} className="flex items-center gap-2.5 lg:hidden">
          <BrandMark className="size-8 rounded-xl shadow-xs" />
          <span className="font-bold text-base tracking-tight">CivicSense</span>
        </Link>

        <div className="hidden h-9 items-center gap-2 rounded-full border border-border/80 bg-surface-muted/50 px-3 text-xs font-medium md:flex">
          <GraduationCap className="size-3.5 text-primary" strokeWidth={2} aria-hidden />
          <span className="font-semibold">{t("shell.university")}</span>
          <span className="text-muted-foreground/60 font-normal">·</span>
          <span className="text-muted-foreground">{t(`roles.${role}`)}</span>
        </div>

        <form action="/my" role="search" className="hidden h-10 min-w-0 flex-1 items-center gap-2.5 rounded-xl border border-border bg-surface-muted/60 px-3.5 text-sm transition-colors focus-within:border-border-strong focus-within:bg-surface sm:flex md:max-w-md">
          <Search className="size-4 shrink-0 text-subtle-foreground" strokeWidth={1.75} aria-hidden />
          <input
            type="search"
            name="q"
            aria-label={t("header.search")}
            placeholder={t("header.search")}
            className="min-w-0 flex-1 bg-transparent outline-none text-sm"
          />
          <kbd className="hidden rounded-md border border-border bg-surface px-1.5 py-0.5 font-sans text-[11px] text-muted-foreground sm:inline">⌘K</kbd>
        </form>

        <div className="ml-auto flex items-center gap-1 sm:gap-1.5">
          <LanguageSwitch />
          <ModeToggle />
          {user ? (
            <>
              {(role === "dept_admin" || role === "super_admin") && (
                <Link href="/admin" className={buttonVariants({ variant: "secondary", size: "sm", className: "mr-1" })}>
                  <LayoutDashboard strokeWidth={1.75} aria-hidden />
                  <span className="hidden sm:inline">{t("nav.adminPanel")}</span>
                  <span className="sr-only sm:hidden">{t("nav.adminPanel")}</span>
                </Link>
              )}
              <NotificationBell userId={user.id} />
              <Link href="/profile" aria-label={t("shell.openProfile")} className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <Avatar name={name} src={profile?.avatar_url} size="md" decorative className="ring-1 ring-border" />
              </Link>
            </>
          ) : (
            <Link href="/login" className={buttonVariants({ variant: "primary", size: "sm" })}>{t("shell.signIn")}</Link>
          )}
        </div>
      </div>
    </header>
  );
}
