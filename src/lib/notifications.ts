import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/** Unread notification count for the bell (RLS: own rows only). null on error. */
export async function unreadCount(supabase: SupabaseClient, userId: string): Promise<number | null> {
  const { count, error } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("read", false);
  return error ? null : (count ?? 0);
}
