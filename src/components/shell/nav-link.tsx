"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

/** True when `pathname` is `href` or below it ("/" and section roots like "/admin" match exactly). */
export function isActivePath(pathname: string, href: string, exact = false) {
  if (href === "/" || exact) return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Link that knows whether it is the current page (sets aria-current + `activeClassName`). */
export function NavLink({
  href, exact, className, activeClassName, inactiveClassName, children, title, "aria-label": ariaLabel,
}: {
  href: string;
  exact?: boolean;
  className?: string;
  activeClassName?: string;
  inactiveClassName?: string;
  children: React.ReactNode;
  title?: string;
  "aria-label"?: string;
}) {
  const pathname = usePathname() ?? "/";
  const on = isActivePath(pathname, href, exact);
  return (
    <Link href={href} aria-current={on ? "page" : undefined} title={title} aria-label={ariaLabel} className={cn(className, on ? activeClassName : inactiveClassName)}>
      {children}
    </Link>
  );
}
