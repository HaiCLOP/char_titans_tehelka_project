import type { NextRequest } from "next/server";
import { VerifyRequestSchema } from "@/lib/domain";
import { fail, ok, parseJson, requireUser } from "@/lib/api";
import { PipelineError } from "@/lib/complaints";
import { verifyComplaint } from "@/lib/tracking";

// Reporter: "Confirm fixed" (→ closed + rating), "Not fixed" (→ in_progress) or reopen within 7 days.
export async function POST(req: NextRequest, ctx: RouteContext<"/api/complaints/[id]/verify">) {
  const { id } = await ctx.params;
  const auth = await requireUser();
  if (auth instanceof Response) return auth;
  const body = await parseJson(req, VerifyRequestSchema);
  if (body instanceof Response) return body;
  try {
    return ok(await verifyComplaint(auth.supabase, { id: auth.user.id, profile: auth.profile }, id, body));
  } catch (e) {
    if (e instanceof PipelineError) return fail(e.code, e.message);
    console.error("[complaints] verify failed", e instanceof Error ? e.message : e);
    return fail("INTERNAL", "Could not update the complaint");
  }
}
