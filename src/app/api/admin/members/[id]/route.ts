import type { NextRequest } from "next/server";
import { z } from "zod";
import { fail, failFrom, ok, parseJson, requireRole } from "@/lib/api";
import { MemberPatchSchema } from "@/lib/domain";
import { updateMember } from "@/lib/org";
import { audit } from "@/lib/audit";

const Id = z.guid();

// S18 — change a member's role, department, skills, coverage or active flag. Super admins: anyone but
// themselves; department admins: field staff and staff of their own department (checked in applyMember).
export async function PATCH(req: NextRequest, ctx: RouteContext<"/api/admin/members/[id]">) {
  const { id } = await ctx.params;
  const auth = await requireRole("super_admin", "dept_admin");
  if (auth instanceof Response) return auth;
  if (!Id.safeParse(id).success) return fail("NOT_FOUND", "Member not found");
  const body = await parseJson(req, MemberPatchSchema);
  if (body instanceof Response) return body;
  try {
    const member = await updateMember(auth.supabase, { id: auth.user.id, profile: auth.profile }, id, body);
    await audit(auth.user.id, "member.update", `profiles:${id}`, { changes: body });
    return ok(member);
  } catch (e) {
    return failFrom(e, "update the member");
  }
}
