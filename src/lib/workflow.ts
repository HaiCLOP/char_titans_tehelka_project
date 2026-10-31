import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { StaffExperienceSchema, type StaffExperience } from "@/lib/domain";
import { PipelineError } from "@/lib/complaints";
import { isManager, patchComplaint, type Actor } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { idFilter } from "@/lib/tracking";

/**
 * Assignment workflow (migration 18): approving the suggested assignee, ticket teams (helpers) and the hidden
 * staff experience. Every write checks here that the caller manages the ticket's department, then uses the
 * service role (complaint_helpers has no write policies; ai_meta is not writable by users).
 */

type TicketRow = { id: string; code: string; department_id: string | null; assignee_id: string | null; is_sensitive: boolean; status: string; ai_meta: Record<string, unknown> | null };

async function managedTicket(supabase: SupabaseClient, actor: Actor, idOrCode: string): Promise<TicketRow> {
  const f = idFilter(idOrCode);
  if (!f) throw new PipelineError("NOT_FOUND", "Complaint not found");
  const { data, error } = await supabase
    .from("complaints")
    .select("id, code, department_id, assignee_id, is_sensitive, status, ai_meta")
    .eq(f.col, f.value)
    .maybeSingle();
  if (error) throw new PipelineError("INTERNAL", "Could not load the complaint");
  if (!data) throw new PipelineError("NOT_FOUND", "Complaint not found");
  const row = data as TicketRow;
  if (!isManager(actor.profile, row.department_id)) throw new PipelineError("FORBIDDEN", "Admins of this department only");
  return row;
}

async function clearProposal(id: string) {
  const admin = createAdminClient();
  const { data } = await admin.from("complaints").select("ai_meta").eq("id", id).maybeSingle();
  const meta = { ...((data?.ai_meta as Record<string, unknown> | null) ?? {}) };
  if (!("assign_proposal" in meta)) return;
  delete meta.assign_proposal;
  const { error } = await admin.from("complaints").update({ ai_meta: meta }).eq("id", id);
  if (error) console.warn("[workflow] clear proposal failed", error.code, error.message);
}

/** Approve (assign the suggested person through the normal PATCH rules) or dismiss the suggestion. */
export async function decideProposal(supabase: SupabaseClient, actor: Actor, idOrCode: string, approve: boolean) {
  const row = await managedTicket(supabase, actor, idOrCode);
  const proposal = (row.ai_meta?.assign_proposal ?? null) as { id?: unknown } | null;
  if (!proposal || typeof proposal.id !== "string") throw new PipelineError("NOT_FOUND", "There is no suggestion to decide");
  let result = null;
  if (approve) {
    if (row.assignee_id) throw new PipelineError("CONFLICT", "Someone is already assigned");
    result = await patchComplaint(supabase, actor, row.id, { assignee_id: proposal.id });
  }
  await clearProposal(row.id);
  return result;
}

/** People on the ticket's team besides the lead. */
export async function listHelpers(supabase: SupabaseClient, complaintId: string): Promise<{ id: string; name: string | null }[]> {
  const { data, error } = await supabase.from("complaint_helpers").select("user_id").eq("complaint_id", complaintId);
  if (error || !data?.length) return [];
  const ids = data.map((r) => r.user_id as string);
  const { data: people } = await createAdminClient().from("profiles").select("id, full_name").in("id", ids);
  const names = new Map(((people ?? []) as { id: string; full_name: string | null }[]).map((p) => [p.id, p.full_name]));
  return ids.map((id) => ({ id, name: names.get(id) ?? null }));
}

export async function addHelper(supabase: SupabaseClient, actor: Actor, idOrCode: string, userId: string) {
  const row = await managedTicket(supabase, actor, idOrCode);
  if (!row.assignee_id) throw new PipelineError("VALIDATION_ERROR", "Assign a lead first, then add helpers");
  if (userId === row.assignee_id) throw new PipelineError("VALIDATION_ERROR", "They already lead this job");
  const admin = createAdminClient();
  const { data: person } = await admin.from("profiles").select("id, role, department_id, active").eq("id", userId).maybeSingle();
  const p = person as { id: string; role: string; department_id: string | null; active: boolean } | null;
  if (!p || !p.active || !["field_staff", "dept_admin"].includes(p.role) || p.department_id !== row.department_id) {
    throw new PipelineError("VALIDATION_ERROR", "Pick active staff of this complaint's department");
  }
  if (row.is_sensitive && p.role !== "dept_admin") {
    throw new PipelineError("FORBIDDEN", "Sensitive reports can only be handled by department admins");
  }
  const { error } = await admin.from("complaint_helpers").insert({ complaint_id: row.id, user_id: userId, added_by: actor.id });
  if (error && error.code !== "23505") {
    console.error("[workflow] add helper failed", error.code, error.message);
    throw new PipelineError("INTERNAL", "Could not add them to the team");
  }
  await admin.from("complaint_events").insert({
    complaint_id: row.id, actor_id: actor.id, type: "note",
    note_en: "Added a helper to the team", note_as: "দলটোত এজন সহায়ক যোগ কৰা হ'ল",
  });
  return listHelpers(supabase, row.id);
}

export async function removeHelper(supabase: SupabaseClient, actor: Actor, idOrCode: string, userId: string) {
  const row = await managedTicket(supabase, actor, idOrCode);
  const { error } = await createAdminClient().from("complaint_helpers").delete().eq("complaint_id", row.id).eq("user_id", userId);
  if (error) throw new PipelineError("INTERNAL", "Could not remove them from the team");
  return listHelpers(supabase, row.id);
}

/** Hidden experience; the RPC only returns people the caller may see (super admin, their dept admin, self). */
export async function staffExperience(supabase: SupabaseClient, ids: string[]): Promise<Map<string, StaffExperience>> {
  if (ids.length === 0) return new Map();
  const { data, error } = await supabase.rpc("staff_experience", { uids: ids });
  if (error) {
    console.warn("[workflow] experience failed", error.code, error.message);
    return new Map();
  }
  const rows = StaffExperienceSchema.array().safeParse(data ?? []);
  return new Map((rows.success ? rows.data : []).map((r) => [r.user_id, r]));
}
