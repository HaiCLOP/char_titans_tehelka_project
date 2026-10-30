import type { NextRequest } from "next/server";
import { LIST_PAGE_SIZE, NotificationsPageSchema, type NotificationItem } from "@/lib/domain";
import { fail, ok, requireUser } from "@/lib/api";
import { unreadCount } from "@/lib/notifications";

// The signed-in user's notifications, newest first (S09). Cursor = id of the last item.
export async function GET(req: NextRequest) {
  const auth = await requireUser();
  if (auth instanceof Response) return auth;
  const { supabase, user } = auth;

  const rawCursor = req.nextUrl.searchParams.get("cursor");
  const cursor = rawCursor ? Number(rawCursor) : null;
  if (rawCursor && (!Number.isSafeInteger(cursor) || cursor! <= 0)) return fail("VALIDATION_ERROR", "Invalid cursor");

  let query = supabase
    .from("notifications")
    .select("id, complaint_id, title_en, title_as, read, created_at")
    .eq("user_id", user.id)
    .order("id", { ascending: false })
    .limit(LIST_PAGE_SIZE + 1);
  if (cursor) query = query.lt("id", cursor);

  const [list, unread] = await Promise.all([query, unreadCount(supabase, user.id)]);
  if (list.error || unread === null) return fail("INTERNAL", "Could not load notifications");

  const rows = (list.data ?? []) as NotificationItem[];
  const items = rows.slice(0, LIST_PAGE_SIZE);
  const nextCursor = rows.length > LIST_PAGE_SIZE ? String(items.at(-1)!.id) : null;
  return ok(NotificationsPageSchema.parse({ items, nextCursor, unread }));
}
