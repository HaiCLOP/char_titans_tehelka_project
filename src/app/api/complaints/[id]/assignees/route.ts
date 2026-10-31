import type { NextRequest } from "next/server";
import { failFrom, ok, requireRole } from "@/lib/api";
import { suggestAssignees } from "@/lib/assign";

// S15 — ranked field staff for this ticket (skills + buildings + load). Admins of its department / super admin.
export async function GET(_req: NextRequest, ctx: RouteContext<"/api/complaints/[id]/assignees">) {
  const { id } = await ctx.params;
  const auth = await requireRole("dept_admin", "super_admin");
  if (auth instanceof Response) return auth;
  try {
    return ok(await suggestAssignees(auth.supabase, { id: auth.user.id, profile: auth.profile }, id));
  } catch (e) {
    return failFrom(e, "rank staff");
  }
}
