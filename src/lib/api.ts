import "server-only";
import { NextResponse } from "next/server";
import type { User } from "@supabase/supabase-js";
import type { z } from "zod";
import { ERROR_STATUS, type ApiError, type ErrorCode, type Profile, type Role } from "@/lib/domain";
import { createClient } from "@/lib/supabase/server";
import { PROFILE_COLUMNS } from "@/lib/auth";

/**
 * Route handler helpers (PRD section 10).
 *
 *   const auth = await requireRole("dept_admin", "super_admin");
 *   if (auth instanceof Response) return auth;
 *   const { user, profile, supabase } = auth;
 */

export type ApiContext = {
  user: User;
  profile: Profile;
  supabase: Awaited<ReturnType<typeof createClient>>;
};

export function ok<T>(data: T, init?: ResponseInit) {
  return NextResponse.json(data, init);
}

export function fail(code: ErrorCode, message: string, init?: Omit<ResponseInit, "status">) {
  return NextResponse.json<ApiError>({ error: { code, message } }, { ...init, status: ERROR_STATUS[code] });
}

/** Signed-in user + profile + an RLS-scoped Supabase client, or a 401/403 Response. */
export async function requireUser(): Promise<ApiContext | Response> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return fail("UNAUTHENTICATED", "Sign in required");
  const { data } = await supabase.from("profiles").select(PROFILE_COLUMNS).eq("id", user.id).maybeSingle();
  if (!data) return fail("FORBIDDEN", "Profile not found");
  return { user, profile: data as Profile, supabase };
}

/** Like `requireUser`, plus a 403 when the user's role is not one of `roles`. */
export async function requireRole(...roles: Role[]): Promise<ApiContext | Response> {
  const ctx = await requireUser();
  if (ctx instanceof Response) return ctx;
  if (!roles.includes(ctx.profile.role)) return fail("FORBIDDEN", "Not allowed for your role");
  return ctx;
}

/** Parses and validates a JSON body, or returns a 400 Response. */
export async function parseJson<S extends z.ZodType>(req: Request, schema: S): Promise<z.infer<S> | Response> {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail("VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Invalid request body");
  return parsed.data;
}

/** Maps a thrown PipelineError (an Error with an API `code`) to a JSON error Response; logs anything else. */
export function failFrom(e: unknown, what: string) {
  if (e instanceof Error && "code" in e && typeof e.code === "string" && e.code in ERROR_STATUS) {
    return fail(e.code as ErrorCode, e.message);
  }
  console.error(`[api] ${what} failed`, e instanceof Error ? e.message : e);
  return fail("INTERNAL", `Could not ${what}`);
}
