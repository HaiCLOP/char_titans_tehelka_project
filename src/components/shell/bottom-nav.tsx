"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { ClipboardList, Home, Map, Plus, UserRound, Wrench } from "lucide-react";
import type { Role } from "@/lib/domain";
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
export function BottomNav({ role }: { role?: Role } = {}) {
  const t = useTranslations("nav");
  const pathname = usePathname() ?? "/";
  const reportOn = isActivePath(pathname, "/report");
  // Field staff: the "My reports" slot becomes their work list (S12).
  const items = role === "field_staff" ? SIDE.map((i) => (i?.href === "/my" ? { href: "/staff", key: "workShort", icon: Wrench } : i)) : SIDE;
  return (
    <nav
      aria-label={t("main")}
      className="fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-40 rounded-full border border-border bg-surface/95 shadow-rail backdrop-blur-md lg:hidden"
    >
      <ul className="mx-auto grid h-16 max-w-md grid-cols-5 items-stretch px-1">
        {items.map((item) => {
          if (!item) {
            return (
              <li key="report" className="flex justify-center">
                <Link
                  href="/report"
                  aria-current={reportOn ? "page" : undefined}
                  className="flex items-center justify-center focus-visible:outline-none"
                >
                  <span className="grid size-12 place-items-center rounded-full bg-primary text-primary-foreground shadow-md transition-transform duration-200 ease-out-expo active:scale-95">
                    <Plus className="size-6" aria-hidden />
                  </span>
                  <span className="sr-only">{t("reportShort")}</span>
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
                  "flex h-full flex-col items-center justify-center gap-1 rounded-full px-1 text-[10.5px] leading-tight transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                  on ? "font-semibold text-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                <item.icon className="size-5" strokeWidth={on ? 2.1 : 1.75} aria-hidden />
                <span className="line-clamp-2 max-w-full text-center break-words">{t(item.key)}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
