import type { NextRequest } from "next/server";
import { z } from "zod";
import { fail, failFrom, ok, parseJson, requireRole } from "@/lib/api";
import { DepartmentPatchSchema } from "@/lib/domain";
import { deleteDepartment, updateDepartment } from "@/lib/org";
import { audit } from "@/lib/audit";

const Id = z.guid();

// S18 — edit / delete a department (super admin only). Delete is refused (409 CONFLICT) while any
// complaint or member still references it.
export async function PATCH(req: NextRequest, ctx: RouteContext<"/api/admin/departments/[id]">) {
  const { id } = await ctx.params;
  const auth = await requireRole("super_admin");
  if (auth instanceof Response) return auth;
  if (!Id.safeParse(id).success) return fail("NOT_FOUND", "Department not found");
  const body = await parseJson(req, DepartmentPatchSchema);
  if (body instanceof Response) return body;
  try {
    const dept = await updateDepartment(auth.supabase, id, body);
    await audit(auth.user.id, "department.update", `departments:${id}`, { changes: body });
    return ok(dept);
  } catch (e) {
    return failFrom(e, "update the department");
  }
}

export async function DELETE(_req: NextRequest, ctx: RouteContext<"/api/admin/departments/[id]">) {
  const { id } = await ctx.params;
  const auth = await requireRole("super_admin");
  if (auth instanceof Response) return auth;
  if (!Id.safeParse(id).success) return fail("NOT_FOUND", "Department not found");
  try {
    await deleteDepartment(auth.supabase, id);
    await audit(auth.user.id, "department.delete", `departments:${id}`);
    return ok({ id });
  } catch (e) {
    return failFrom(e, "delete the department");
  }
}
