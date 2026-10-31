"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

const ITEMS = [
  { href: "", key: "overview" },
  { href: "/keys", key: "keys" },
  { href: "/models", key: "models" },
  { href: "/logs", key: "logs" },
] as const;

/** Segmented pill nav. `base` is the public secret path (the browser never sees the internal /sys route). */
export function SysNav({ base }: { base: string }) {
  const t = useTranslations("sys.nav");
  const path = usePathname();
  return (
    <nav aria-label={t("label")} className="order-last w-full overflow-x-auto sm:order-none sm:w-auto">
      <ul className="flex w-max gap-1 rounded-full border border-border bg-surface p-1">
        {ITEMS.map((item) => {
          const href = `${base}${item.href}`;
          const active = item.href === "" ? path === base || path === `${base}/` : path.startsWith(href);
          return (
            <li key={item.key}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "inline-flex h-8 items-center rounded-full px-3.5 text-sm font-medium whitespace-nowrap transition-colors",
                  active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {t(item.key)}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
