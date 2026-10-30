"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { ClipboardList, Home, Map, Plus, UserRound } from "lucide-react";
import { cn } from "@/lib/utils";
import { isActivePath } from "./nav-link";

const SIDE = [
  { href: "/", key: "home", icon: Home },
  { href: "/my", key: "myReportsShort", icon: ClipboardList },
  null, // centre: Report
  { href: "/map", key: "mapShort", icon: Map },
  { href: "/profile", key: "profile", icon: UserRound },
] as const;

/**
 * Mobile bottom navigation (hidden on lg+, where the sidebar shows). Pages using it need bottom padding:
 * the student layout adds `pb-24 lg:pb-0`. Height ≈ 4rem + safe-area inset.
 */
export function BottomNav() {
  const t = useTranslations("nav");
  const pathname = usePathname() ?? "/";
  const reportOn = isActivePath(pathname, "/report");
  return (
    <nav
      aria-label={t("main")}
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
    >
      <ul className="mx-auto grid h-16 max-w-md grid-cols-5 items-stretch">
        {SIDE.map((item) => {
          if (!item) {
            return (
              <li key="report" className="flex justify-center">
                <Link
                  href="/report"
                  aria-current={reportOn ? "page" : undefined}
                  className="-mt-5 flex flex-col items-center gap-0.5 text-[11px] font-medium text-primary focus-visible:outline-none"
                >
                  <span className="grid size-14 place-items-center rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/25 ring-4 ring-background transition active:scale-95">
                    <Plus className="size-6" aria-hidden />
                  </span>
                  <span className="max-w-full truncate">{t("reportShort")}</span>
                </Link>
              </li>
            );
          }
          const on = isActivePath(pathname, item.href);
          return (
            <li key={item.href} className="min-w-0">
              <Link
                href={item.href}
                aria-current={on ? "page" : undefined}
                className={cn(
                  "flex h-full flex-col items-center justify-center gap-1 px-1 text-[11px] leading-tight transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                  on ? "font-semibold text-primary" : "text-muted-foreground hover:text-foreground",
                )}
              >
                <item.icon className="size-5" aria-hidden />
                <span className="max-w-full truncate">{t(item.key)}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
