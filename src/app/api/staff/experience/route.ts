import { fail, ok, requireRole } from "@/lib/api";
import { staffExperience } from "@/lib/workflow";

// The signed-in field staff's own experience (hidden from everyone except them, their dept admins, super admins).
export async function GET() {
  const auth = await requireRole("field_staff", "dept_admin");
  if (auth instanceof Response) return auth;
  const exp = (await staffExperience(auth.supabase, [auth.user.id])).get(auth.user.id);
  return exp ? ok(exp) : fail("INTERNAL", "Could not load your experience");
}
