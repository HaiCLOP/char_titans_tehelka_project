import type { NextRequest } from "next/server";
import { z } from "zod";
import { fail, failFrom, ok, parseJson, requireRole } from "@/lib/api";
import { MemberPatchSchema } from "@/lib/domain";
import { updateMember } from "@/lib/org";

const Id = z.guid();

// S18 — change a member's role, department, skills, coverage or active flag (super admin only).
export async function PATCH(req: NextRequest, ctx: RouteContext<"/api/admin/members/[id]">) {
  const { id } = await ctx.params;
  const auth = await requireRole("super_admin");
  if (auth instanceof Response) return auth;
  if (!Id.safeParse(id).success) return fail("NOT_FOUND", "Member not found");
  const body = await parseJson(req, MemberPatchSchema);
  if (body instanceof Response) return body;
  try {
    return ok(await updateMember(auth.supabase, { id: auth.user.id, profile: auth.profile }, id, body));
  } catch (e) {
    return failFrom(e, "update the member");
  }
}
