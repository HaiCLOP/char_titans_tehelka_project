import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Bell, ClipboardList, House, LayoutDashboard, Map, Plus, UserRound, Wrench } from "lucide-react";
import { getProfile } from "@/lib/auth";
import { BrandMark } from "./brand-mark";
import { NavLink } from "./nav-link";

const MAIN = [
  { href: "/", key: "home", icon: House, exact: true },
  { href: "/report", key: "report", icon: Plus, isCta: true },
  { href: "/my", key: "myReports", icon: ClipboardList },
  { href: "/map", key: "map", icon: Map },
  { href: "/notifications", key: "notifications", icon: Bell },
] as const;

const ITEM =
  "group relative grid size-11 place-items-center rounded-full transition-all duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const ON = "bg-primary text-primary-foreground shadow-md ring-1 ring-primary/40";
const OFF = "text-muted-foreground hover:bg-surface-muted hover:text-foreground";

/** Desktop (lg+) sleek floating capsule dock on the left edge. */
export async function Sidebar() {
  const [t, profile] = await Promise.all([getTranslations(), getProfile()]);
  const role = profile?.role ?? "guest";
  const main =
    role === "field_staff"
      ? [{ href: "/staff", key: "work", icon: Wrench }, ...MAIN]
      : role === "dept_admin" || role === "super_admin"
        ? [{ href: "/admin", key: "adminPanel", icon: LayoutDashboard }, ...MAIN]
        : MAIN;

  const renderItem = (i: { href: string; key: string; icon: typeof House; exact?: boolean; isCta?: boolean }) => (
    <li key={i.href}>
      <NavLink
        href={i.href}
        exact={i.exact}
        aria-label={t(`nav.${i.key}`)}
        className={ITEM}
        activeClassName={ON}
        inactiveClassName={i.isCta ? "bg-primary/10 text-primary hover:bg-primary/20" : OFF}
      >
        <i.icon className="size-5" strokeWidth={1.8} aria-hidden />
        {/* Sleek popout hover tooltip */}
        <span
          aria-hidden
          className="pointer-events-none absolute left-full ml-3.5 hidden rounded-lg border border-border/80 bg-surface px-3 py-1.5 text-xs font-semibold whitespace-nowrap text-foreground opacity-0 shadow-lg transition-all duration-150 group-hover:block group-hover:opacity-100 group-focus-visible:block group-focus-visible:opacity-100"
        >
          {t(`nav.${i.key}`)}
        </span>
      </NavLink>
    </li>
  );

  return (
    <aside className="fixed top-1/2 left-5 z-40 hidden -translate-y-1/2 lg:block">
      <div className="flex w-16 flex-col items-center gap-2 rounded-full border border-border/80 bg-surface/90 p-2.5 shadow-2xl backdrop-blur-xl ring-1 ring-border/40">
        <Link
          href="/"
          aria-label={t("shell.home")}
          className="mb-1 rounded-full p-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-transform hover:scale-105 active:scale-95"
        >
          <BrandMark className="size-11 rounded-full shadow-xs" />
        </Link>

        <nav aria-label={t("nav.main")}>
          <ul className="flex flex-col items-center gap-2">
            {main.map(renderItem)}
          </ul>
        </nav>

        <span className="my-1.5 h-px w-6 bg-border/80" aria-hidden />

        <ul>
          {renderItem({ href: "/profile", key: "profile", icon: UserRound })}
        </ul>
      </div>
    </aside>
  );
}
