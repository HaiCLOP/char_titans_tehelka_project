import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { INTERNAL_AUTH_HEADER, INTERNAL_AUTH_SECRET, PATH_HEADER } from "@/lib/paths";
import { SYS_HEADER, sysPanelSegment } from "@/lib/sys-path";

// Next 16: `middleware` is now `proxy` (Node runtime). Refreshes the Supabase session cookie and
// forwards the current path so server components can build `/login?next=…` (see src/lib/auth.ts).
// System panel (PRD 13): `/${SYS_PANEL_PATH}/…` is rewritten to the internal `/sys/…` route with a
// private header; the header is stripped from every incoming request, so a direct `/sys` hit 404s.
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const path = pathname + request.nextUrl.search;
  const segment = sysPanelSegment();
  const sysRest =
    segment && (pathname === `/${segment}` || pathname.startsWith(`/${segment}/`)) ? pathname.slice(segment.length + 1) : null;

  const allCookies = request.cookies.getAll();
  const hasAuthCookie = allCookies.some((c) => c.name.includes("-auth-token") || c.name.startsWith("sb-"));

  let verifiedUserId: string | null = null;
  let verifiedUserEmail: string | null = null;

  const makeHeaders = () => {
    const headers = new Headers(request.headers);
    headers.delete(SYS_HEADER);
    headers.delete(INTERNAL_AUTH_HEADER);
    headers.delete("x-cs-user-id");
    headers.delete("x-cs-user-email");
    headers.set(PATH_HEADER, path);
    if (verifiedUserId) {
      headers.set(INTERNAL_AUTH_HEADER, INTERNAL_AUTH_SECRET);
      headers.set("x-cs-user-id", verifiedUserId);
      if (verifiedUserEmail) headers.set("x-cs-user-email", verifiedUserEmail);
    }
    if (sysRest !== null) headers.set(SYS_HEADER, "1");
    return headers;
  };

  const forward = () => {
    const headers = makeHeaders();
    if (sysRest === null) return NextResponse.next({ request: { headers } });
    const url = request.nextUrl.clone();
    url.pathname = `/sys${sysRest}`;
    return NextResponse.rewrite(url, { request: { headers } });
  };

  let response = forward();

  // ponytail: skip auth roundtrip if no session cookie exists. Saves 400-600ms on public requests.
  if (hasAuthCookie) {
    const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (list) => {
          list.forEach(({ name, value }) => request.cookies.set(name, value));
          response = forward();
          list.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    });
    const { data } = await supabase.auth.getUser();
    if (data?.user) {
      verifiedUserId = data.user.id;
      verifiedUserEmail = data.user.email ?? "";
      const prevCookies = response.cookies.getAll();
      const headers = makeHeaders();
      if (sysRest === null) {
        response = NextResponse.next({ request: { headers } });
      } else {
        const url = request.nextUrl.clone();
        url.pathname = `/sys${sysRest}`;
        response = NextResponse.rewrite(url, { request: { headers } });
      }
      prevCookies.forEach((c) => response.cookies.set(c.name, c.value, c));
    }
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|manifest.json|.*\\.(?:svg|png|jpg|jpeg|gif|webp|woff|woff2|ttf|eot|otf|ico)$).*)",
  ],
};
