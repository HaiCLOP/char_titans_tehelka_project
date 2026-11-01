import { CHARACTER_SHEET } from "@/lib/campus";
import { cn } from "@/lib/utils";

/** Rendered frame height in px per size (frames are 64 × 80, shown at 4:5 inside a round avatar). */
const PX = { xs: 24, sm: 32, md: 40, lg: 56, xl: 72 } as const;
export type CharacterSize = keyof typeof PX;

/**
 * One of the 60 pixel characters from /campus/team-characters.webp (10 × 6 sheet, 64 × 80 frames),
 * drawn with CSS background-position. Decorative; the parent supplies the accessible name.
 */
export function CharacterSprite({ id, size = "md", className }: { id: number; size?: CharacterSize | number; className?: string }) {
  const { cols, rows, frameW, frameH, url } = CHARACTER_SHEET;
  const h = typeof size === "number" ? size : PX[size];
  const w = (h * frameW) / frameH;
  const n = ((Math.trunc(id) % (cols * rows)) + cols * rows) % (cols * rows);
  return (
    <span
      aria-hidden
      className={cn("inline-block shrink-0 [image-rendering:pixelated]", className)}
      style={{
        width: w,
        height: h,
        backgroundImage: `url(${url})`,
        backgroundRepeat: "no-repeat",
        backgroundSize: `${w * cols}px ${h * rows}px`,
        backgroundPosition: `${-(n % cols) * w}px ${-Math.floor(n / cols) * h}px`,
      }}
    />
  );
}
