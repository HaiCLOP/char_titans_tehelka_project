import type { NextRequest } from "next/server";
import { AdminStatsQuerySchema } from "@/lib/domain";
import { fail, failFrom, ok, requireRole } from "@/lib/api";
import { getAdminStats } from "@/lib/admin";

// Dashboard numbers (S13), scoped to the admin's department (super admin: all, or ?department=).
export async function GET(req: NextRequest) {
  const auth = await requireRole("dept_admin", "super_admin");
  if (auth instanceof Response) return auth;
  const q = AdminStatsQuerySchema.safeParse(Object.fromEntries(req.nextUrl.searchParams));
  if (!q.success) return fail("VALIDATION_ERROR", q.error.issues[0]?.message ?? "Invalid query");
  try {
    return ok(await getAdminStats(auth.supabase, { id: auth.user.id, profile: auth.profile }, q.data.days, q.data.department));
  } catch (e) {
    return failFrom(e, "load the dashboard");
  }
}
