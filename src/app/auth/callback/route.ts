import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import type { Profile } from "@/lib/domain";
import { createClient } from "@/lib/supabase/server";
import { PROFILE_COLUMNS, afterLoginPath, safeNext } from "@/lib/auth";

// Google OAuth and email magic links land here. PKCE flow sends `?code=`; a custom email template
// may send `?token_hash=&type=` instead. On success → onboarding / safe `next` / role home.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const next = safeNext(searchParams.get("next"));
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const failTo = new URL("/login?error=callback", origin);
  if (next) failTo.searchParams.set("next", next);

  if (searchParams.get("error")) return NextResponse.redirect(failTo);

  const supabase = await createClient();
  let error: unknown = null;
  if (code) ({ error } = await supabase.auth.exchangeCodeForSession(code));
  else if (tokenHash && type) ({ error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type }));
  else error = new Error("missing code");
  if (error) return NextResponse.redirect(failTo);

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(failTo);
  const { data: profile } = await supabase.from("profiles").select(PROFILE_COLUMNS).eq("id", user.id).maybeSingle();

  return NextResponse.redirect(new URL(afterLoginPath(profile as Profile | null, next), origin));
}
