import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { AssigneeSuggestionSchema, type AssigneeSuggestion, type Profile } from "@/lib/domain";
import { PipelineError } from "@/lib/complaints";
import { createAdminClient } from "@/lib/supabase/admin";
import { idFilter } from "@/lib/tracking";

/**
 * Staff matching ("skills + buildings + load", migration 10).
 *
 * The scoring lives in SQL (`rank_assignees`) so the workspace suggestions, the submit pipeline and any
 * background worker (Go engine) use exactly the same rule, and it can be proven with rolled-back SQL tests:
 *   1. skill   — ticket category ∈ profiles.skills; required when any active field staff of the department
 *                has skills set, otherwise department membership is enough
 *   2. covers  — ticket building ∈ coverage_location_ids (bonus); empty list = all buildings
 *   3. load    — fewest open assigned tickets (assigned + in_progress)
 *   4. fairness— longest since last assignment
 * Only active field staff of the ticket's department are candidates.
 */

const RankRow = z.object({
  id: z.string(),
  full_name: z.string().nullable(),
  score: z.number(),
  skill_match: z.boolean(),
  skill_required: z.boolean(),
  covers: z.boolean(),
  open_jobs: z.number(),
});

const AutoResult = z.object({ id: z.string(), name: z.string().nullable() }).nullable();

/**
 * Best-effort auto-assignment of a freshly auto-routed ticket (service role). `auto_assign_complaint`
 * re-checks the safe-auto-route rule itself (triaged, AI, confidence ≥ 0.75, not sensitive/suggested, not
 * urgent, not abusive), assigns the top candidate, writes the bilingual timeline note + ai_meta reason and
 * notifies the assignee. Never throws: returns null when nothing was assigned.
 */
export async function autoAssign(complaintId: string): Promise<{ id: string; name: string | null } | null> {
  try {
    const { data, error } = await createAdminClient().rpc("auto_assign_complaint", { cid: complaintId });
    if (error) {
      console.warn("[assign] auto-assign failed", error.code, error.message);
      return null;
    }
    const parsed = AutoResult.safeParse(data ?? null);
    return parsed.success ? parsed.data : null;
  } catch (e) {
    console.warn("[assign] auto-assign failed", e instanceof Error ? e.message : e);
    return null;
  }
}

/**
 * Emergency auto-assignment (migration 16), only when a super admin turned on `auto_assign_emergency`.
 * Urgent reports go to field staff of the routed department, or a department admin when sensitive.
 * Never throws: returns null when the setting is off or nobody could be picked.
 */
export async function autoAssignEmergency(complaintId: string): Promise<{ id: string; name: string | null } | null> {
  try {
    const { data, error } = await createAdminClient().rpc("auto_assign_emergency", { cid: complaintId });
    if (error) {
      console.warn("[assign] emergency auto-assign failed", error.code, error.message);
      return null;
    }
    const parsed = AutoResult.safeParse(data ?? null);
    return parsed.success ? parsed.data : null;
  } catch (e) {
    console.warn("[assign] emergency auto-assign failed", e instanceof Error ? e.message : e);
    return null;
  }
}

/** Ranked suggestions for the workspace rail. Admins of the ticket's department / super admin only. */
export async function suggestAssignees(
  supabase: SupabaseClient,
  actor: { id: string; profile: Profile },
  idOrCode: string,
): Promise<AssigneeSuggestion[]> {
  const f = idFilter(idOrCode);
  if (!f) throw new PipelineError("NOT_FOUND", "Complaint not found");
  const { data: row, error } = await supabase.from("complaints").select("id, department_id").eq(f.col, f.value).maybeSingle();
  if (error) {
    console.error("[assign] load failed", error.code, error.message);
    throw new PipelineError("INTERNAL", "Could not load the complaint");
  }
  if (!row) throw new PipelineError("NOT_FOUND", "Complaint not found");
  const r = row as { id: string; department_id: string | null };
  const p = actor.profile;
  const manager = p.role === "super_admin" || (p.role === "dept_admin" && !!p.department_id && p.department_id === r.department_id);
  if (!manager) throw new PipelineError("FORBIDDEN", "Admins of this department only");
  if (!r.department_id) return [];

  // The RPC re-checks the caller (dept admin of the ticket's department / super admin) with auth.uid().
  const { data, error: rankErr } = await supabase.rpc("rank_assignees", { cid: r.id });
  if (rankErr) {
    if (rankErr.code === "42501") throw new PipelineError("FORBIDDEN", "Admins of this department only");
    console.error("[assign] rank failed", rankErr.code, rankErr.message);
    throw new PipelineError("INTERNAL", "Could not rank staff");
  }
  return RankRow.array()
    .parse(data ?? [])
    .slice(0, 5)
    .map((x) =>
      AssigneeSuggestionSchema.parse({
        id: x.id,
        name: x.full_name,
        score: Math.round(x.score),
        reasons: { skill: x.skill_match, covers: x.covers, open_jobs: Math.round(x.open_jobs) },
      }),
    );
}
