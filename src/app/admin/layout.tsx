import { cookies } from "next/headers";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { LanguageSwitch, ModeToggle } from "@/components/preference-switchers";
import { AdminSidebar } from "@/components/shell/admin-sidebar";
import { ADMIN_NAV_COOKIE } from "@/components/shell/admin-nav";
import { getProfile } from "@/lib/auth";
import { AdminClock } from "@/components/admin/admin-clock";

/**
 * Admin shell. Access control is enforced per page with `requireRole("dept_admin", "super_admin")`
 * (layouts do not re-run on client navigation); the layout only reads the role to filter nav items.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const [profile, store] = await Promise.all([getProfile(), cookies()]);
  const collapsed = store.get(ADMIN_NAV_COOKIE)?.value === "collapsed";
  return (
    <div className="min-h-dvh lg:flex">
      <AdminSidebar
        role={profile?.role ?? "student"}
        defaultCollapsed={collapsed}
        toolbar={
          <>
            <LanguageSwitch />
            <ModeToggle />
            <NotificationBell userId={profile?.id ?? null} />
          </>
        }
      />
      <div className="min-w-0 flex-1">
        <header className="flex min-h-16 flex-wrap items-center justify-between gap-3 px-4 sm:px-8">
          <AdminClock initialTimestamp={new Date().toISOString()} />
          <div className="hidden items-center gap-1.5 lg:flex">
          <LanguageSwitch />
          <ModeToggle />
          <NotificationBell userId={profile?.id ?? null} />
          </div>
        </header>
        <main className="px-4 pt-6 pb-12 sm:px-8 lg:pt-2">{children}</main>
      </div>
    </div>
  );
}
