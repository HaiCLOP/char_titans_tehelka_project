import { AdminSettingsSchema, type AdminSettings } from "@/lib/domain";
import { fail, ok, parseJson, requireRole } from "@/lib/api";
import { audit } from "@/lib/audit";

// Super admin switches kept in app_config (RLS: readable by all, writable by super admin only).
export async function GET() {
  const auth = await requireRole("super_admin");
  if (auth instanceof Response) return auth;
  const { data, error } = await auth.supabase.from("app_config").select("value").eq("key", "auto_assign_emergency").maybeSingle();
  if (error) return fail("INTERNAL", "Could not load settings");
  const enabled = (data?.value as { enabled?: unknown } | null)?.enabled === true;
  return ok<AdminSettings>({ auto_assign_emergency: enabled });
}

export async function PATCH(req: Request) {
  const auth = await requireRole("super_admin");
  if (auth instanceof Response) return auth;
  const body = await parseJson(req, AdminSettingsSchema);
  if (body instanceof Response) return body;
  const { error } = await auth.supabase
    .from("app_config")
    .upsert({ key: "auto_assign_emergency", value: { enabled: body.auto_assign_emergency } });
  if (error) return fail("INTERNAL", "Could not save settings");
  await audit(auth.user.id, "settings.update", "app_config:auto_assign_emergency", { enabled: body.auto_assign_emergency });
  return ok<AdminSettings>(body);
}
