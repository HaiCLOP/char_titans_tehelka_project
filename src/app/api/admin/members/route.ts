import type { NextRequest } from "next/server";
import { z } from "zod";
import { fail, failFrom, ok, parseJson, requireRole } from "@/lib/api";
import { MemberAddSchema } from "@/lib/domain";
import { addMember, listMembers } from "@/lib/org";

const Query = z.object({ department: z.guid().optional() });

// S18 — members (super admin only). GET ?department= lists that department's people with role, skills,
// coverage, active and open-job count; without it, everyone who is not a plain student.
export async function GET(req: NextRequest) {
  const auth = await requireRole("super_admin");
  if (auth instanceof Response) return auth;
  const q = Query.safeParse(Object.fromEntries(req.nextUrl.searchParams));
  if (!q.success) return fail("VALIDATION_ERROR", "Invalid department");
  try {
    return ok(await listMembers(auth.supabase, q.data.department));
  } catch (e) {
    return failFrom(e, "load members");
  }
}

// Give an existing account (signed in at least once) a role in a department. Found by email.
export async function POST(req: Request) {
  const auth = await requireRole("super_admin");
  if (auth instanceof Response) return auth;
  const body = await parseJson(req, MemberAddSchema);
  if (body instanceof Response) return body;
  try {
    return ok(await addMember(auth.supabase, { id: auth.user.id, profile: auth.profile }, body));
  } catch (e) {
    return failFrom(e, "add the member");
  }
}
