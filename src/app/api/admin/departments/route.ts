import { failFrom, ok, parseJson, requireRole } from "@/lib/api";
import { DepartmentInputSchema } from "@/lib/domain";
import { createDepartment, listDepartments } from "@/lib/org";

// S18 — departments (super admin only): list with member + open counts, create.
export async function GET() {
  const auth = await requireRole("super_admin");
  if (auth instanceof Response) return auth;
  try {
    return ok(await listDepartments(auth.supabase));
  } catch (e) {
    return failFrom(e, "load departments");
  }
}

export async function POST(req: Request) {
  const auth = await requireRole("super_admin");
  if (auth instanceof Response) return auth;
  const body = await parseJson(req, DepartmentInputSchema);
  if (body instanceof Response) return body;
  try {
    return ok(await createDepartment(auth.supabase, body), { status: 201 });
  } catch (e) {
    return failFrom(e, "create the department");
  }
}
