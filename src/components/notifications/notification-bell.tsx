"use client";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { Bell } from "lucide-react";
import { cn, toLocaleDigits } from "@/lib/utils";
import { useUnreadCount } from "./use-notifications";

/**
 * Header bell with the live unread count (GET /api/notifications + Realtime on `notifications`).
 * Pass `userId={null}` when signed out: it becomes a plain link (→ /notifications → sign-in).
 * Mount from the (server) header: `<NotificationBell userId={(await getUser())?.id ?? null} />`.
 */
export function NotificationBell({ userId, className }: { userId: string | null; className?: string }) {
  const t = useTranslations("notifications");
  const locale = useLocale();
  const { data: unread = 0 } = useUnreadCount(userId, true);
  const shown = unread > 99 ? `${toLocaleDigits(99, locale)}+` : toLocaleDigits(unread, locale);
  return (
    <Link
      href="/notifications"
      aria-label={unread > 0 ? t("bellUnread", { count: unread, n: toLocaleDigits(unread, locale) }) : t("bell")}
      className={cn(
        "relative grid size-10 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-surface-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
    >
      <Bell className="size-[18px]" strokeWidth={1.75} aria-hidden />
      {unread > 0 && (
        <span
          aria-hidden
          className="tabular absolute top-1 right-0.5 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground ring-2 ring-surface"
        >
          {shown}
        </span>
      )}
    </Link>
  );
}
