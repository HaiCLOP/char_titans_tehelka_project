import type { NextRequest } from "next/server";
import { fail, ok, requireUser } from "@/lib/api";
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
