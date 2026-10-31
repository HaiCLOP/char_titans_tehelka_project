import { BottomNav } from "@/components/shell/bottom-nav";
import { Header } from "@/components/shell/header";
import { Sidebar } from "@/components/shell/sidebar";
import { getProfile } from "@/lib/auth";

/**
 * Field staff shell (S12): the same calm shell as reporters (floating rail on desktop, bottom nav on mobile),
 * so staff who also report problems feel at home. Access is checked per page.
 */
export default async function StaffLayout({ children }: { children: React.ReactNode }) {
  const profile = await getProfile();
  return (
    <div className="min-h-dvh flex flex-col bg-background">
      <Sidebar />
      <Header />
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 pt-6 pb-28 sm:px-8 sm:pt-8 lg:pb-16 lg:pl-72">{children}</main>
      <BottomNav role={profile?.role} />
    </div>
  );
}
