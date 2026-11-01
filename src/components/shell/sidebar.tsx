import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Activity, Bell, Building2, ClipboardList, House, LayoutDashboard, Map, Plus, UserRound, Wrench } from "lucide-react";
import { getProfile } from "@/lib/auth";
import { BrandMark } from "./brand-mark";
import { NavLink } from "./nav-link";

const MAIN = [
  { href: "/", key: "home", icon: House, exact: true },
  { href: "/report", key: "report", icon: Plus },
  { href: "/my", key: "myReports", icon: ClipboardList },
  { href: "/map", key: "map", icon: Map },
  { href: "/pulse", key: "pulse", icon: Activity },
  { href: "/departments", key: "departments", icon: Building2 },
  { href: "/notifications", key: "notifications", icon: Bell },
] as const;

const ITEM =
  "group relative grid size-11 place-items-center rounded-full transition-[background-color,color,box-shadow] duration-200 ease-out-expo focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const ON = "bg-surface text-foreground shadow-md ring-1 ring-border dark:bg-surface-muted";
const OFF = "text-muted-foreground hover:bg-surface-muted hover:text-foreground";

/** Desktop (lg+) floating icon rail. Labels show as tooltips and stay available to screen readers. */
export async function Sidebar() {
  const [t, profile] = await Promise.all([getTranslations(), getProfile()]);
  const role = profile?.role;
  const main =
    role === "field_staff"
      ? [{ href: "/staff", key: "work", icon: Wrench }, ...MAIN]
      : role === "dept_admin" || role === "super_admin"
        ? [{ href: "/admin", key: "adminPanel", icon: LayoutDashboard }, ...MAIN]
        : MAIN;

  const item = (i: { href: string; key: string; icon: typeof House; exact?: boolean }) => (
    <li key={i.href}>
      <NavLink href={i.href} exact={i.exact} aria-label={t(`nav.${i.key}`)} className={ITEM} activeClassName={ON} inactiveClassName={OFF}>
        <i.icon className="size-[19px]" strokeWidth={1.75} aria-hidden />
        <span
          aria-hidden
          className="pointer-events-none absolute left-full ml-3 rounded-lg bg-primary px-2.5 py-1 text-xs font-medium whitespace-nowrap text-primary-foreground opacity-0 shadow-md transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100"
        >
          {t(`nav.${i.key}`)}
        </span>
      </NavLink>
    </li>
  );

  return (
    <aside id="tour-sidebar" className="fixed top-1/2 left-5 z-30 hidden -translate-y-1/2 lg:block">
      <div className="flex w-[4.25rem] flex-col items-center gap-2 rounded-full border border-border bg-surface px-2 py-3 shadow-rail">
        <Link href="/" aria-label={t("shell.home")} className="mb-2 rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <BrandMark className="size-12" />
        </Link>
        <nav aria-label={t("nav.main")}>
          <ul className="flex flex-col items-center gap-2">{main.map(item)}</ul>
        </nav>
        <span className="my-2 h-px w-8 bg-border" aria-hidden />
        <ul>{item({ href: "/profile", key: "profile", icon: UserRound })}</ul>
      </div>
    </aside>
  );
}
