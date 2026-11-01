import { resolveCharacter } from "@/lib/campus";
import { cn } from "@/lib/utils";
import { CharacterSprite } from "./character-avatar";

const SIZE = { xs: "size-6 text-[10px]", sm: "size-8 text-xs", md: "size-10 text-sm", lg: "size-14 text-lg" } as const;
/** Character frame height per avatar size (a little under the circle so the whole figure shows). */
const SPRITE = { xs: 22, sm: 30, md: 36, lg: 52 } as const;

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = Array.from(parts[0])[0] ?? "";
  const last = parts.length > 1 ? (Array.from(parts[parts.length - 1])[0] ?? "") : "";
  return (first + last).toUpperCase();
}

/**
 * Photo, else the user's pixel character (`characterId`, or a stable default derived from `seed`,
 * usually the user id), else initials. `name` is also the accessible label unless `decorative`.
 */
export function Avatar({ name, src, size = "md", className, decorative = false, characterId, seed }: {
  name: string | null | undefined;
  src?: string | null;
  size?: keyof typeof SIZE;
  className?: string;
  decorative?: boolean;
  /** profiles.avatar_character (0–59). */
  characterId?: number | null;
  /** Stable seed (user id) for the default character when none is chosen. */
  seed?: string | null;
}) {
  const label = name?.trim() || "";
  const character = src ? null : resolveCharacter(characterId, seed);
  return (
    <span
      className={cn(
        "relative inline-grid shrink-0 place-items-center overflow-hidden rounded-full font-semibold",
        character !== null ? "bg-surface-muted" : "bg-primary-soft text-primary",
        SIZE[size],
        className,
      )}
      role={decorative ? undefined : "img"}
      aria-label={decorative ? undefined : label || undefined}
      aria-hidden={decorative || undefined}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element -- avatars come from arbitrary OAuth hosts
        <img src={src} alt="" className="size-full object-cover" referrerPolicy="no-referrer" />
      ) : character !== null ? (
        <CharacterSprite id={character} size={SPRITE[size]} className="translate-y-[6%]" />
      ) : (
        <span aria-hidden>{initials(label)}</span>
      )}
    </span>
  );
}
