import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Bell, ClipboardList, House, LayoutDashboard, Map, Plus, UserRound, Wrench } from "lucide-react";
import { getProfile } from "@/lib/auth";
import { buttonVariants } from "@/components/ui/button";
import { BrandMark } from "./brand-mark";
import { NavLink } from "./nav-link";

const MAIN = [
  { href: "/", key: "home", icon: House, exact: true },
  { href: "/my", key: "myReports", icon: ClipboardList },
  { href: "/map", key: "map", icon: Map },
  { href: "/notifications", key: "notifications", icon: Bell },
] as const;

/** Desktop (lg+) docked sidebar with clear labels, prominent CTA, and clean active states. */
export async function Sidebar() {
  const [t, profile] = await Promise.all([getTranslations(), getProfile()]);
  const role = profile?.role ?? "guest";
  const main =
    role === "field_staff"
      ? [{ href: "/staff", key: "work", icon: Wrench }, ...MAIN]
      : role === "dept_admin" || role === "super_admin"
        ? [{ href: "/admin", key: "adminPanel", icon: LayoutDashboard }, ...MAIN]
        : MAIN;

  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-border bg-surface/95 backdrop-blur-sm lg:flex">
      {/* Brand Header */}
      <div className="flex h-16 items-center gap-3 border-b border-border/70 px-5">
        <Link
          href="/"
          aria-label={t("shell.home")}
          className="flex items-center gap-3 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <BrandMark className="size-9 rounded-xl shadow-xs" />
          <div className="min-w-0">
            <span className="block truncate font-bold text-base leading-tight tracking-tight">CivicSense</span>
            <span className="block truncate text-[11px] font-medium text-muted-foreground">{t("shell.university")}</span>
          </div>
        </Link>
      </div>

      {/* Primary Action Button */}
      <div className="px-4 pt-5 pb-2">
        <Link
          href="/report"
          className={buttonVariants({
            variant: "primary",
            className: "w-full justify-center gap-2 rounded-xl h-11 font-semibold text-sm shadow-sm transition-transform active:scale-[0.98]",
          })}
        >
          <Plus className="size-4" strokeWidth={2.5} aria-hidden />
          {t("hero.cta")}
        </Link>
      </div>

      {/* Navigation Links */}
      <nav aria-label={t("nav.main")} className="flex-1 overflow-y-auto px-3 py-3">
        <ul className="space-y-1">
          {main.map((i) => (
            <li key={i.href}>
              <NavLink
                href={i.href}
                exact={"exact" in i ? i.exact : undefined}
                className="group flex h-10 items-center gap-3 rounded-xl px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                activeClassName="bg-primary/10 text-primary font-semibold"
                inactiveClassName="text-muted-foreground hover:bg-surface-muted hover:text-foreground"
              >
                <i.icon className="size-4.5 shrink-0 transition-transform group-hover:scale-105" strokeWidth={1.8} aria-hidden />
                <span className="truncate">{t(`nav.${i.key}`)}</span>
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      {/* User / Profile Section at Bottom */}
      <div className="border-t border-border/70 p-3">
        <NavLink
          href="/profile"
          className="flex h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          activeClassName="bg-primary/10 text-primary font-semibold"
          inactiveClassName="text-muted-foreground hover:bg-surface-muted hover:text-foreground"
        >
          <UserRound className="size-4.5 shrink-0" strokeWidth={1.8} aria-hidden />
          <div className="min-w-0 flex-1">
            <span className="block truncate">{profile?.full_name || t("nav.profile")}</span>
            <span className="block truncate text-[10px] text-muted-foreground uppercase tracking-wider">{t(`roles.${role}`)}</span>
          </div>
        </NavLink>
      </div>
    </aside>
  );
}
