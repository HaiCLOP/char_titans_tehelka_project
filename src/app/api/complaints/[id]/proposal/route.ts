import type { NextRequest } from "next/server";
import { ProposalDecisionSchema } from "@/lib/domain";
import { failFrom, ok, parseJson, requireRole } from "@/lib/api";
import { decideProposal } from "@/lib/workflow";

// Approve ({approve: true}) or dismiss the workflow's suggested assignee. Admins of the ticket only.
export async function POST(req: NextRequest, ctx: RouteContext<"/api/complaints/[id]/proposal">) {
  const { id } = await ctx.params;
  const auth = await requireRole("dept_admin", "super_admin");
  if (auth instanceof Response) return auth;
  const body = await parseJson(req, ProposalDecisionSchema);
  if (body instanceof Response) return body;
  try {
    return ok({ result: await decideProposal(auth.supabase, { id: auth.user.id, profile: auth.profile }, id, body.approve) });
  } catch (e) {
    return failFrom(e, "decide the suggestion");
  }
}
