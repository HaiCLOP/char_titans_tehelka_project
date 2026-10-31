import type { NextRequest } from "next/server";
import { z } from "zod";
import { fail, failFrom, ok, parseJson, requireRole } from "@/lib/api";
import { MemberAddSchema } from "@/lib/domain";
import { addMember, listMembers } from "@/lib/org";
import { audit } from "@/lib/audit";

const Query = z.object({ department: z.guid().optional() });

// S18 — members. GET ?department= lists that department's people with role, skills, coverage, active,
// open jobs and experience; without it (super admin), everyone who is not a plain student.
// Department admins always get their own department.
export async function GET(req: NextRequest) {
  const auth = await requireRole("super_admin", "dept_admin");
  if (auth instanceof Response) return auth;
  const q = Query.safeParse(Object.fromEntries(req.nextUrl.searchParams));
  if (!q.success) return fail("VALIDATION_ERROR", "Invalid department");
  const own = auth.profile.role === "dept_admin" ? auth.profile.department_id : undefined;
  if (own === null) return fail("FORBIDDEN", "You are not assigned to a department yet");
  try {
    return ok(await listMembers(auth.supabase, own ?? q.data.department));
  } catch (e) {
    return failFrom(e, "load members");
  }
}

// Give an account a role (and a department for staff roles). Found by email; unknown emails get an invite.
export async function POST(req: Request) {
  const auth = await requireRole("super_admin", "dept_admin");
  if (auth instanceof Response) return auth;
  const body = await parseJson(req, MemberAddSchema);
  if (body instanceof Response) return body;
  try {
    const base = process.env.NEXT_PUBLIC_SITE_URL || new URL(req.url).origin;
    const member = await addMember(auth.supabase, { id: auth.user.id, profile: auth.profile }, body, new URL("/auth/callback", base).toString());
    await audit(auth.user.id, "member.add", `profiles:${member.id}`, { role: body.role, department_id: body.department_id ?? null, invited: Boolean(member.invited) });
    return ok(member);
  } catch (e) {
    return failFrom(e, "add the member");
  }
}
