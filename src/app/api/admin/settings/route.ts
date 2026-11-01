import type { SupabaseClient } from "@supabase/supabase-js";
import { AdminSettingsPatchSchema, AdminSettingsSchema, ASSIGN_MODES, type AdminSettings } from "@/lib/domain";
import { fail, ok, parseJson, requireRole } from "@/lib/api";
import { audit } from "@/lib/audit";

// Assignment workflow switches in app_config (RLS: readable by all, writable by super admin only).
type Raw = { key: string; value: Record<string, unknown> | null };

function read(rows: Raw[]): AdminSettings {
  const emergency = rows.find((r) => r.key === "auto_assign_emergency")?.value ?? {};
  const mode = rows.find((r) => r.key === "assign_mode")?.value?.mode;
  return AdminSettingsSchema.parse({
    auto_assign_emergency: emergency.enabled === true,
    emergency_team_size: Math.min(4, Math.max(1, Number(emergency.team_size) || 1)),
    assign_mode: (ASSIGN_MODES as readonly unknown[]).includes(mode) ? mode : "approval",
  });
}

async function load(supabase: SupabaseClient) {
  const { data, error } = await supabase.from("app_config").select("key, value").in("key", ["auto_assign_emergency", "assign_mode"]);
  return error ? null : read((data ?? []) as Raw[]);
}

export async function GET() {
  const auth = await requireRole("super_admin", "dept_admin");
  if (auth instanceof Response) return auth;
  const s = await load(auth.supabase);
  return s ? ok(s) : fail("INTERNAL", "Could not load settings");
}

export async function PATCH(req: Request) {
  const auth = await requireRole("super_admin");
  if (auth instanceof Response) return auth;
  const body = await parseJson(req, AdminSettingsPatchSchema);
  if (body instanceof Response) return body;
  const cur = await load(auth.supabase);
  if (!cur) return fail("INTERNAL", "Could not load settings");
  const next = { ...cur, ...body };
  const { error } = await auth.supabase.from("app_config").upsert([
    { key: "auto_assign_emergency", value: { enabled: next.auto_assign_emergency, team_size: next.emergency_team_size } },
    { key: "assign_mode", value: { mode: next.assign_mode } },
  ]);
  if (error) return fail("INTERNAL", "Could not save settings");
  await audit(auth.user.id, "settings.update", "app_config:assignment", body);
  return ok<AdminSettings>(next);
}
