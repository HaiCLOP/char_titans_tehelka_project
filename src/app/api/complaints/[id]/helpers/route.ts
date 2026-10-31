import type { NextRequest } from "next/server";
import { z } from "zod";
import { HelperAddSchema } from "@/lib/domain";
import { fail, failFrom, ok, parseJson, requireRole } from "@/lib/api";
import { addHelper, removeHelper } from "@/lib/workflow";

// Ticket team: add (POST {user_id}) or remove (DELETE ?user=) a helper besides the lead. Admins of the ticket.
export async function POST(req: NextRequest, ctx: RouteContext<"/api/complaints/[id]/helpers">) {
  const { id } = await ctx.params;
  const auth = await requireRole("dept_admin", "super_admin");
  if (auth instanceof Response) return auth;
  const body = await parseJson(req, HelperAddSchema);
  if (body instanceof Response) return body;
  try {
    return ok(await addHelper(auth.supabase, { id: auth.user.id, profile: auth.profile }, id, body.user_id));
  } catch (e) {
    return failFrom(e, "add the helper");
  }
}

export async function DELETE(req: NextRequest, ctx: RouteContext<"/api/complaints/[id]/helpers">) {
  const { id } = await ctx.params;
  const auth = await requireRole("dept_admin", "super_admin");
  if (auth instanceof Response) return auth;
  const user = z.guid().safeParse(req.nextUrl.searchParams.get("user"));
  if (!user.success) return fail("VALIDATION_ERROR", "Invalid user");
  try {
    return ok(await removeHelper(auth.supabase, { id: auth.user.id, profile: auth.profile }, id, user.data));
  } catch (e) {
    return failFrom(e, "remove the helper");
  }
}
