import type { NextRequest } from "next/server";
import { z } from "zod";
import { fail, failFrom, ok, requireRole } from "@/lib/api";
import { listStaff } from "@/lib/admin";

const Query = z.object({ department: z.guid().optional() });

// People who can be assigned in a department (field staff + dept admins). Names only.
export async function GET(req: NextRequest) {
  const auth = await requireRole("dept_admin", "super_admin");
  if (auth instanceof Response) return auth;
  const q = Query.safeParse(Object.fromEntries(req.nextUrl.searchParams));
  if (!q.success) return fail("VALIDATION_ERROR", "Invalid department");
  try {
    return ok(await listStaff(auth.supabase, { id: auth.user.id, profile: auth.profile }, q.data.department));
  } catch (e) {
    return failFrom(e, "load staff");
  }
}
