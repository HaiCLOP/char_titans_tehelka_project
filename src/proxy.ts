import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { PATH_HEADER } from "@/lib/paths";

// Next 16: `middleware` is now `proxy` (Node runtime). Refreshes the Supabase session cookie and
// forwards the current path so server components can build `/login?next=…` (see src/lib/auth.ts).
export async function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname + request.nextUrl.search;
  const forward = () => {
    const headers = new Headers(request.headers);
    headers.set(PATH_HEADER, path);
    return NextResponse.next({ request: { headers } });
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
