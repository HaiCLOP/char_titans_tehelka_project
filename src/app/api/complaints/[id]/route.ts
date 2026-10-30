import type { NextRequest } from "next/server";
import { fail, failFrom, ok, parseJson, requireUser } from "@/lib/api";
import { patchComplaint } from "@/lib/admin";
import { ComplaintPatchSchema } from "@/lib/domain";
import { PipelineError } from "@/lib/complaints";
import { getComplaintDetail } from "@/lib/tracking";

// Ticket detail (S08). Visibility is decided by RLS: anything the caller may not see is a plain 404,
// so a private ticket's existence is never revealed (PRD NEG2).
export async function GET(_req: NextRequest, ctx: RouteContext<"/api/complaints/[id]">) {
  const { id } = await ctx.params;
  const auth = await requireUser();
  if (auth instanceof Response) return auth;
  try {
    const detail = await getComplaintDetail(auth.supabase, { id: auth.user.id, profile: auth.profile }, id);
    return detail ? ok(detail) : fail("NOT_FOUND", "Complaint not found");
  } catch (e) {
    if (e instanceof PipelineError) return fail(e.code, e.message);
    console.error("[complaints] detail failed", e instanceof Error ? e.message : e);
    return fail("INTERNAL", "Could not load the complaint");
  }
}

// Triage / assign / status (S12, S15). Admins of the ticket's department or super admin: any field.
// Assignee: status -> in_progress only (+ note). RLS + DB triggers make the final decision.
export async function PATCH(req: NextRequest, ctx: RouteContext<"/api/complaints/[id]">) {
  const { id } = await ctx.params;
  const auth = await requireUser();
  if (auth instanceof Response) return auth;
  const body = await parseJson(req, ComplaintPatchSchema);
  if (body instanceof Response) return body;
  try {
    return ok(await patchComplaint(auth.supabase, { id: auth.user.id, profile: auth.profile }, id, body));
  } catch (e) {
    return failFrom(e, "update the complaint");
  }
}
