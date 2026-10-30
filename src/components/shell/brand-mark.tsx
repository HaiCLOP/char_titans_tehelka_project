import { cn } from "@/lib/utils";

/**
 * CivicSense mark: an ink tile holding a speech bubble whose tail is a map pin —
 * "a report, at a place". Drawn, not a letter in a box.
 */
export function BrandMark({ className }: { className?: string }) {
  return (
    <span className={cn("grid place-items-center rounded-2xl bg-primary text-primary-foreground", className)} aria-hidden>
      <svg viewBox="0 0 24 24" className="size-[46%]" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
        <path d="M5 5.5h14a1.5 1.5 0 0 1 1.5 1.5v7.5A1.5 1.5 0 0 1 19 16h-5.2L12 19.6 10.2 16H5a1.5 1.5 0 0 1-1.5-1.5V7A1.5 1.5 0 0 1 5 5.5Z" />
        <path d="M8 10.75h8" />
      </svg>
    </span>
  );
}
