import type { Role } from "@/lib/domain";

/** Request header set by src/proxy.ts with the current path + query. */
export const PATH_HEADER = "x-cs-path";

/** Where each role lands after sign-in. */
export function roleHome(role: Role): string {
  switch (role) {
    case "field_staff":
      return "/staff";
    case "dept_admin":
    case "super_admin":
      return "/admin";
    default:
      return "/";
  }
}

const BASE = "http://civicsense.invalid";

/**
 * Returns `next` only if it is a same-origin, path-only URL (no scheme, host, `//` or `\`),
 * and not an auth route (avoids loops). Otherwise null.
 */
export function safeNext(next: string | null | undefined): string | null {
  if (!next || next.length > 512 || !next.startsWith("/") || next.startsWith("//") || /[\\\u0000-\u001f]/.test(next)) {
    return null;
  }
  try {
    const url = new URL(next, BASE);
    if (url.origin !== BASE) return null;
    if (url.pathname === "/login" || url.pathname.startsWith("/auth/")) return null;
    return url.pathname + url.search + url.hash;
  } catch {
    return null;
  }
}

/** `/login?next=<path>` (drops unsafe or empty paths). */
export function loginUrl(next?: string | null): string {
  const safe = safeNext(next);
  return safe && safe !== "/" ? `/login?next=${encodeURIComponent(safe)}` : "/login";
}
