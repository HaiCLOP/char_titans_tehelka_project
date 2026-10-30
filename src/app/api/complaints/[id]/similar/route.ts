import type { NextRequest } from "next/server";
import { fail, failFrom, ok, requireRole } from "@/lib/api";
import { similarForComplaint } from "@/lib/admin";

// Possible duplicates of a ticket for its admins (S15 "Similar tickets"), private tickets in reach included.
export async function GET(_req: NextRequest, ctx: RouteContext<"/api/complaints/[id]/similar">) {
  const { id } = await ctx.params;
  const auth = await requireRole("dept_admin", "super_admin");
  if (auth instanceof Response) return auth;
  try {
    const items = await similarForComplaint(auth.supabase, { id: auth.user.id, profile: auth.profile }, id);
    if (items === null) return fail("AI_UNAVAILABLE", "Duplicate search is unavailable right now");
    return ok(items);
  } catch (e) {
    return failFrom(e, "find similar complaints");
  }
}
