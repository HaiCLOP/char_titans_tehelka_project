import { cn } from "@/lib/utils";

const SIZE = { xs: "size-6 text-[10px]", sm: "size-8 text-xs", md: "size-10 text-sm", lg: "size-14 text-lg" } as const;

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = Array.from(parts[0])[0] ?? "";
  const last = parts.length > 1 ? (Array.from(parts[parts.length - 1])[0] ?? "") : "";
  return (first + last).toUpperCase();
}

/** Photo with initials fallback. `name` is also the accessible label unless `decorative`. */
export function Avatar({ name, src, size = "md", className, decorative = false }: {
  name: string | null | undefined;
  src?: string | null;
  size?: keyof typeof SIZE;
  className?: string;
  decorative?: boolean;
}) {
  const label = name?.trim() || "";
  return (
    <span
      className={cn("relative inline-grid shrink-0 place-items-center overflow-hidden rounded-full bg-primary-soft font-semibold text-primary", SIZE[size], className)}
      role={decorative ? undefined : "img"}
      aria-label={decorative ? undefined : label || undefined}
      aria-hidden={decorative || undefined}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element -- avatars come from arbitrary OAuth hosts
        <img src={src} alt="" className="size-full object-cover" referrerPolicy="no-referrer" />
      ) : (
        <span aria-hidden>{initials(label)}</span>
      )}
    </span>
  );
}
