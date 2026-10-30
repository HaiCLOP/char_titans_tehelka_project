import { MarkReadRequestSchema, UnreadCountSchema } from "@/lib/domain";
import { fail, ok, parseJson, requireUser } from "@/lib/api";
import { unreadCount } from "@/lib/notifications";

// Mark some (`ids`) or all of the caller's notifications as read.
export async function POST(req: Request) {
  const auth = await requireUser();
  if (auth instanceof Response) return auth;
  const { supabase, user } = auth;
  const body = await parseJson(req, MarkReadRequestSchema);
  if (body instanceof Response) return body;

  let query = supabase.from("notifications").update({ read: true }).eq("user_id", user.id).eq("read", false);
  if (body.ids) {
    if (body.ids.length === 0) {
      const unread = await unreadCount(supabase, user.id);
      return unread === null ? fail("INTERNAL", "Could not load notifications") : ok(UnreadCountSchema.parse({ unread }));
    }
    query = query.in("id", body.ids);
  }
  const { error } = await query;
  if (error) return fail("INTERNAL", "Could not update notifications");

  const unread = await unreadCount(supabase, user.id);
  if (unread === null) return fail("INTERNAL", "Could not load notifications");
  return ok(UnreadCountSchema.parse({ unread }));
}
