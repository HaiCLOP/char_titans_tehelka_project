import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Append-only record of a privileged action (system panel, roles, departments) in audit_logs (migration 11).
 * `details` must be redacted: never secrets, keys or complaint text. Written with the service role after the
 * action succeeded; a failed write is logged loudly (the action already happened and is not undone).
 */
export async function audit(actorId: string, action: string, target: string, details: Record<string, unknown> = {}) {
  const { error } = await createAdminClient().from("audit_logs").insert({ actor_id: actorId, action, target, details });
  if (error) console.error(`[audit] FAILED to record ${action} on ${target}`, error.code, error.message);
}
