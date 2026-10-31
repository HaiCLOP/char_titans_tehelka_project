import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { getProfile, requireUser } from "@/lib/auth";
import { NotificationList } from "@/components/notifications/notification-list";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("notifications");
  return { title: t("metaTitle") };
}

// S09 — Notifications.
export default async function NotificationsPage() {
  const { user } = await requireUser();
  const role = (await getProfile())?.role;
  return <NotificationList userId={user.id} admin={role === "dept_admin" || role === "super_admin"} />;
}
