"use client";
import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Building2, ChevronsLeft, ChevronsRight, ClipboardList, Home, LayoutDashboard, Map, Menu, MessagesSquare, Users, Wrench } from "lucide-react";
import type { Role } from "@/lib/domain";
import { cn, setCookie } from "@/lib/utils";
import { Drawer } from "@/components/ui/dialog";
import { BrandMark } from "./brand-mark";
import { NavLink } from "./nav-link";

import { ADMIN_NAV_COOKIE } from "./admin-nav";

// Only screens that exist. Locations (P1) comes back when its page ships.
const ITEMS = [
  { href: "/admin", key: "dashboard", icon: LayoutDashboard, exact: true, superOnly: false, deptOnly: false },
  { href: "/admin/queue", key: "queue", icon: ClipboardList, exact: false, superOnly: false, deptOnly: false },
  { href: "/admin/agent", key: "agent", icon: MessagesSquare, exact: false, superOnly: false, deptOnly: false },
  { href: "/admin/field-work", key: "fieldWork", icon: Wrench, exact: false, superOnly: false, deptOnly: false },
  { href: "/admin/map", key: "map", icon: Map, exact: false, superOnly: false, deptOnly: false },
  { href: "/admin/departments", key: "departments", icon: Building2, exact: false, superOnly: true, deptOnly: false },
  { href: "/admin/team", key: "team", icon: Users, exact: false, superOnly: false, deptOnly: true },
] as const;

type AdminSidebarProps = {
  /** Super-admin-only items (Departments) are hidden for other roles. */
  role?: Role;
  /** From the `cs_admin_nav` cookie so the first paint matches. */
  defaultCollapsed?: boolean;
  /** Extra controls (language/theme switch) shown in the mobile menu sheet. */
  toolbar?: React.ReactNode;
};

/**
 * Admin navigation. lg+: sticky sidebar that collapses to icons (state saved in a cookie).
 * < lg: a top bar with a menu button opening a bottom sheet.
 */
export function AdminSidebar({ role, defaultCollapsed = false, toolbar }: AdminSidebarProps) {
  const t = useTranslations("nav");
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const [menuOpen, setMenuOpen] = useState(false);

  const toggle = () => {
    const next = !collapsed;
    setCollapsed(next);
    setCookie(ADMIN_NAV_COOKIE, next ? "collapsed" : "open");
  };

  const brand = (compact: boolean) => (
    <Link href="/admin" className="flex min-w-0 items-center gap-3 px-1">
      <BrandMark className="size-10 shrink-0 rounded-xl" />
      {!compact && (
        <span className="min-w-0">
          <span className="block truncate font-semibold leading-tight tracking-[-0.015em]">{t("admin.title")}</span>
          <span className="block truncate text-xs text-muted-foreground">{t("admin.subtitle")}</span>
        </span>
      )}
    </Link>
  );

  const links = (compact: boolean, onNavigate?: () => void) => (
    <ul className="flex flex-col gap-1">
      {ITEMS.filter((i) => (!i.superOnly || role === "super_admin") && (!i.deptOnly || role === "dept_admin")).map((i) => (
        <li key={i.href} onClick={onNavigate}>
          <NavLink
            href={i.href}
            exact={i.exact}
            title={compact ? t(`admin.${i.key}`) : undefined}
            aria-label={compact ? t(`admin.${i.key}`) : undefined}
            className={cn("flex items-center gap-3 rounded-full py-2.5 text-sm transition-[background-color,color,box-shadow] duration-200", compact ? "justify-center px-0" : "px-3.5")}
            activeClassName="bg-surface font-semibold text-foreground shadow-md ring-1 ring-border dark:bg-surface-muted"
            inactiveClassName="text-muted-foreground hover:bg-surface-muted hover:text-foreground"
          >
            <i.icon className="size-[18px] shrink-0" strokeWidth={1.75} aria-hidden />
            {!compact && <span className="truncate">{t(`admin.${i.key}`)}</span>}
          </NavLink>
        </li>
      ))}
    </ul>
  );

  const siteLink = (compact: boolean) => (
    <Link
      href="/"
      title={compact ? t("admin.backToSite") : undefined}
      aria-label={compact ? t("admin.backToSite") : undefined}
      className={cn("flex items-center gap-3 rounded-xl py-2.5 text-sm text-muted-foreground transition hover:bg-surface-muted hover:text-foreground", compact ? "justify-center" : "px-3")}
    >
      <Home className="size-[18px] shrink-0" strokeWidth={1.75} aria-hidden />
      {!compact && t("admin.backToSite")}
    </Link>
  );

  return (
    <>
      {/* Desktop */}
      <aside
        className={cn(
          "sticky top-4 m-4 hidden h-[calc(100dvh-2rem)] shrink-0 flex-col gap-6 overflow-y-auto rounded-[2rem] border border-border bg-surface py-6 shadow-rail transition-[width] duration-300 ease-out-expo lg:flex",
          collapsed ? "w-[4.75rem] px-3" : "w-64 px-4",
        )}
      >
        {brand(collapsed)}
        <nav aria-label={t("admin.title")}>{links(collapsed)}</nav>
        <div className="mt-auto flex flex-col gap-1">
          {siteLink(collapsed)}
          <button
            type="button"
            onClick={toggle}
            aria-expanded={!collapsed}
            aria-label={collapsed ? t("admin.expand") : t("admin.collapse")}
            title={collapsed ? t("admin.expand") : undefined}
            className={cn(
              "flex items-center gap-3 rounded-xl py-2.5 text-sm text-muted-foreground transition hover:bg-surface-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              collapsed ? "justify-center" : "px-3",
            )}
          >
            {collapsed ? <ChevronsRight className="size-[18px]" strokeWidth={1.75} aria-hidden /> : <ChevronsLeft className="size-[18px]" strokeWidth={1.75} aria-hidden />}
            {!collapsed && t("admin.collapse")}
          </button>
        </div>
      </aside>

      {/* Mobile */}
      <div className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-border bg-surface/95 px-4 py-2.5 backdrop-blur lg:hidden">
        {brand(false)}
        <button
          type="button"
          onClick={() => setMenuOpen(true)}
          aria-label={t("admin.menu")}
          aria-haspopup="dialog"
          className="grid size-10 shrink-0 place-items-center rounded-full border border-border bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Menu className="size-5" aria-hidden />
        </button>
      </div>
      <Drawer open={menuOpen} onOpenChange={setMenuOpen} title={t("admin.title")} side="center">
        <nav aria-label={t("admin.title")}>{links(false, () => setMenuOpen(false))}</nav>
        <div className="mt-3 border-t border-border pt-3">{siteLink(false)}</div>
        {toolbar && <div className="mt-4 flex flex-wrap gap-2">{toolbar}</div>}
      </Drawer>
    </>
  );
}
