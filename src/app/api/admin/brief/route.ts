import type { NextRequest } from "next/server";
import { fail, failFrom, ok, requireRole } from "@/lib/api";
import { getAdminBrief } from "@/lib/brief";

const UUID = /^[0-9a-f-]{36}$/i;

// AI daily brief (S13): dept_admin = own department; super_admin = all departments or ?department=<uuid>.
// Cached 1 h per scope in ai_cache; generated through runAI("daily_brief") when missing or stale.
export async function GET(req: NextRequest) {
  const auth = await requireRole("dept_admin", "super_admin");
  if (auth instanceof Response) return auth;
  const department = req.nextUrl.searchParams.get("department");
  if (department && !UUID.test(department)) return fail("VALIDATION_ERROR", "department must be a UUID");
  try {
    const brief = await getAdminBrief(auth.supabase, auth.profile, department);
    return ok(brief, { headers: { "cache-control": "private, no-store" } });
  } catch (e) {
    return failFrom(e, "load the daily brief");
  }
}
