import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { PATH_HEADER } from "@/lib/paths";
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

  const forward = () => {
    const headers = new Headers(request.headers);
    headers.delete(SYS_HEADER);
    headers.set(PATH_HEADER, path);
    if (sysRest === null) return NextResponse.next({ request: { headers } });
    headers.set(SYS_HEADER, "1");
    const url = request.nextUrl.clone();
    url.pathname = `/sys${sysRest}`;
    return NextResponse.rewrite(url, { request: { headers } });
  };

  let response = forward();
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
  await supabase.auth.getUser();
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
