import { ProfileUpdateSchema, type Profile } from "@/lib/domain";
import { fail, ok, parseJson, requireUser } from "@/lib/api";
import { PROFILE_COLUMNS } from "@/lib/auth";
import { LOCALE_COOKIE } from "@/i18n/config";
import { FONT_SIZE_COOKIE, THEME_COOKIE } from "@/lib/theme";

const COOKIE = { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" as const };

// Update the caller's own profile (S10, S04). RLS "profiles self update" keeps the role unchangeable.
// Language/theme changes also set the cookies the UI reads, so the next render switches immediately.
export async function PATCH(req: Request) {
  const auth = await requireUser();
  if (auth instanceof Response) return auth;
  const { supabase, user, profile } = auth;
  const body = await parseJson(req, ProfileUpdateSchema);
  if (body instanceof Response) return body;

  // Department membership of field staff and admins is set by a super admin (S18), not by themselves.
  // Students never belong to a fixing department; they give a course instead.
  if (body.department_id !== undefined && profile.role !== "staff") {
    return fail("FORBIDDEN", profile.role === "student" ? "Students give a course, not a department" : "Your department is managed by an administrator");
  }
  if (body.course !== undefined && profile.role !== "student") {
    return fail("VALIDATION_ERROR", "Only students have a course");
  }

  const { onboarded, ...fields } = body;
  const patch: Record<string, unknown> = { ...fields };
  if (onboarded && !profile.onboarded_at) patch.onboarded_at = new Date().toISOString();
  if (Object.keys(patch).length === 0) return ok(profile);

  const { data, error } = await supabase.from("profiles").update(patch).eq("id", user.id).select(PROFILE_COLUMNS).maybeSingle();
  if (error) {
    if (error.code === "23503") return fail("VALIDATION_ERROR", "Unknown department");
    console.error("[profile] update failed", error.code, error.message);
    return fail("INTERNAL", "Could not update your profile");
  }
  if (!data) return fail("FORBIDDEN", "Profile not found");

  const res = ok(data as Profile);
  if (body.lang_pref) res.cookies.set(LOCALE_COOKIE, body.lang_pref, COOKIE);
  if (body.theme) res.cookies.set(THEME_COOKIE, body.theme, COOKIE);
  if (body.font_size) res.cookies.set(FONT_SIZE_COOKIE, body.font_size, COOKIE);
  return res;
}
