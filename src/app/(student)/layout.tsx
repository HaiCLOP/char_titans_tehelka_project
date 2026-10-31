import { BottomNav } from "@/components/shell/bottom-nav";
import { Header } from "@/components/shell/header";
import { Sidebar } from "@/components/shell/sidebar";
import { getProfile } from "@/lib/auth";

/**
 * Student/staff shell: floating icon rail on desktop (lg+), bottom nav on mobile, one top bar for both.
 * Put reporter pages (/report, /my, /c/[id], /map, /notifications, /profile) inside this route group.
 */
export default async function StudentLayout({ children }: { children: React.ReactNode }) {
  const profile = await getProfile();
  return (
    <div className="min-h-dvh flex flex-col bg-background">
      <Sidebar />
      <Header />
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 pt-6 pb-28 sm:px-8 sm:pt-8 lg:pr-10 lg:pb-16 lg:pl-[7.5rem]">
        {children}
      </main>
      <BottomNav role={profile?.role} />
    </div>
  );
}
