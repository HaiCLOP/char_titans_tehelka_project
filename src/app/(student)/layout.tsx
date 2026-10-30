import { BottomNav } from "@/components/shell/bottom-nav";
import { Header } from "@/components/shell/header";
import { Sidebar } from "@/components/shell/sidebar";

/**
 * Student/staff shell: sidebar on desktop (lg+), bottom nav on mobile.
 * Put reporter pages (/report, /my, /c/[id], /map, /notifications, /profile) inside this route group.
 */
export default function StudentLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex">
      <Sidebar />
      <main className="min-w-0 flex-1 px-4 pb-28 sm:px-8 lg:pb-10">
        <Header />
        {children}
      </main>
      <BottomNav />
    </div>
  );
}
