import { cookies } from "next/headers";
import { LanguageSwitch, ModeToggle } from "@/components/preference-switchers";
import { AdminSidebar } from "@/components/shell/admin-sidebar";
import { ADMIN_NAV_COOKIE } from "@/components/shell/admin-nav";
import { getProfile } from "@/lib/auth";

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
          </>
        }
      />
      <div className="min-w-0 flex-1">
        <header className="hidden h-16 items-center justify-end gap-1.5 px-8 lg:flex">
          <LanguageSwitch />
          <ModeToggle />
        </header>
        <main className="px-4 pt-6 pb-12 sm:px-8 lg:pt-2">{children}</main>
      </div>
    </div>
  );
}
