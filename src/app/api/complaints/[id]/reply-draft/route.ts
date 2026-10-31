import type { NextRequest } from "next/server";
import { failFrom, ok, requireRole } from "@/lib/api";
import { draftReply } from "@/lib/assist/reply-draft";

// AI reply draft (S15): admins of the ticket's department / super admin. Written in the reporter's language;
// the admin edits it and sends it through POST /api/complaints/[id]/messages.
export async function POST(_req: NextRequest, ctx: RouteContext<"/api/complaints/[id]/reply-draft">) {
  const { id } = await ctx.params;
  const auth = await requireRole("dept_admin", "super_admin");
  if (auth instanceof Response) return auth;
  try {
    return ok(await draftReply(auth.supabase, { id: auth.user.id, profile: auth.profile }, id));
  } catch (e) {
    return failFrom(e, "draft a reply");
  }
}
