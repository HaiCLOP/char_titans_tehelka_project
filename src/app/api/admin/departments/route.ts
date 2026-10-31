import { failFrom, ok, parseJson, requireRole } from "@/lib/api";
import { DepartmentInputSchema } from "@/lib/domain";
import { createDepartment, listDepartments } from "@/lib/org";
import { audit } from "@/lib/audit";

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
    const dept = await createDepartment(auth.supabase, body);
    await audit(auth.user.id, "department.create", `departments:${dept.id}`, { name_en: body.name_en });
    return ok(dept, { status: 201 });
  } catch (e) {
    return failFrom(e, "create the department");
  }
}
