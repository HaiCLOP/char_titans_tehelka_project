import type { NextRequest } from "next/server";
import { failFrom, ok, requireRole } from "@/lib/api";
import { checkResolution, getResolutionCheck } from "@/lib/assist/resolution-check";

// Resolution photo check (S15): admins of the ticket's department / super admin. Advisory only.
export async function GET(_req: NextRequest, ctx: RouteContext<"/api/complaints/[id]/check-resolution">) {
  const { id } = await ctx.params;
  const auth = await requireRole("dept_admin", "super_admin");
  if (auth instanceof Response) return auth;
  try {
    return ok(await getResolutionCheck(auth.supabase, { id: auth.user.id, profile: auth.profile }, id));
  } catch (e) {
    return failFrom(e, "load the resolution check");
  }
}

export async function POST(_req: NextRequest, ctx: RouteContext<"/api/complaints/[id]/check-resolution">) {
  const { id } = await ctx.params;
  const auth = await requireRole("dept_admin", "super_admin");
  if (auth instanceof Response) return auth;
  try {
    return ok(await checkResolution(auth.supabase, { id: auth.user.id, profile: auth.profile }, id));
  } catch (e) {
    return failFrom(e, "check the resolution photo");
  }
}
