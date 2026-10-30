import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import type { Profile, Role } from "@/lib/domain";
import { createClient } from "@/lib/supabase/server";
import { PATH_HEADER, loginUrl, roleHome, safeNext } from "@/lib/paths";

export { roleHome, safeNext } from "@/lib/paths";

export const PROFILE_COLUMNS =
  "id, full_name, avatar_url, role, lang_pref, theme, font_size, hostel, course, department_id, onboarded_at";

/** Signed-in user (verified with Supabase Auth), or null. Deduplicated per request. */
export const getUser = cache(async (): Promise<User | null> => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  return data.user ?? null;
});

/** The signed-in user's profile row, or null when signed out. Deduplicated per request. */
export const getProfile = cache(async (): Promise<Profile | null> => {
  const user = await getUser();
  if (!user) return null;
  const supabase = await createClient();
  const { data } = await supabase.from("profiles").select(PROFILE_COLUMNS).eq("id", user.id).maybeSingle();
  return (data as Profile | null) ?? null;
});

/** Where to send a user right after sign-in: onboarding first, then a safe `next`, then their role home. */
export function afterLoginPath(profile: Profile | null, next?: string | null): string {
  const safe = safeNext(next);
  if (!profile?.onboarded_at) return safe ? `/onboarding?next=${encodeURIComponent(safe)}` : "/onboarding";
  return safe ?? roleHome(profile.role);
}

async function currentPath(): Promise<string> {
  return (await headers()).get(PATH_HEADER) ?? "/";
}

/**
 * For server components/pages. Redirects to `/login?next=<current path>` when signed out and to
 * `/onboarding` when setup is not finished (except on the onboarding page itself).
 */
export async function requireUser(): Promise<{ user: User; profile: Profile }> {
  const [user, path] = await Promise.all([getUser(), currentPath()]);
  if (!user) redirect(loginUrl(path));
  const profile = await getProfile();
  // The handle_new_user trigger creates the row at sign-up; a missing row is a broken state, not a redirect.
  if (!profile) throw new Error("Profile row missing for signed-in user");
  if (!profile.onboarded_at && !path.startsWith("/onboarding")) {
    const safe = safeNext(path);
    redirect(safe && safe !== "/" ? `/onboarding?next=${encodeURIComponent(safe)}` : "/onboarding");
  }
  return { user, profile };
}

/**
 * For server components/pages. Like `requireUser`, and a user whose role is not allowed is sent to
 * their own role home (each role home is reachable by that role, so this never loops).
 */
export async function requireRole(...roles: Role[]): Promise<{ user: User; profile: Profile }> {
  const ctx = await requireUser();
  if (!roles.includes(ctx.profile.role)) redirect(roleHome(ctx.profile.role));
  return ctx;
}
