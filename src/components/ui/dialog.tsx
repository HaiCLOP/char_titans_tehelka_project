"use client";
import { useEffect, useId, useRef } from "react";
import { useTranslations } from "next-intl";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export type OverlayProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  children?: React.ReactNode;
  /** Action row at the bottom (buttons). */
  footer?: React.ReactNode;
  className?: string;
  /** Hide the visible title (still used as the accessible name). */
  hideTitle?: boolean;
  /** Close when the backdrop is clicked. Default true. */
  dismissible?: boolean;
};

/**
 * Native <dialog> + showModal(): the rest of the page becomes inert (focus is trapped inside),
 * Esc closes, focus returns to the opener on close. Body scroll is locked while open.
 */
function useModal(open: boolean, onOpenChange: (o: boolean) => void) {
  const ref = useRef<HTMLDialogElement>(null);
  const onChange = useRef(onOpenChange);
  useEffect(() => {
    onChange.current = onOpenChange;
  }, [onOpenChange]);

  useEffect(() => {
    const el = ref.current;
    if (!el || !open) return;
    if (!el.open) el.showModal();
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
      if (el.open) el.close();
    };
  }, [open]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onCancel = (e: Event) => {
      e.preventDefault();
      onChange.current(false);
    };
    el.addEventListener("cancel", onCancel);
    return () => el.removeEventListener("cancel", onCancel);
  }, []);
  return ref;
}

function Shell({
  variant,
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  className,
  hideTitle,
  dismissible = true,
  side = "right",
}: OverlayProps & { variant: "dialog" | "drawer"; side?: "right" | "center" }) {
  const t = useTranslations("ui");
  const ref = useModal(open, onOpenChange);
  const titleId = useId();
  const descId = useId();

  const position =
    variant === "dialog"
      ? "m-auto w-[calc(100%-2rem)] max-w-lg rounded-card"
      : cn(
          // mobile: bottom sheet
          "mx-0 mt-auto mb-0 w-full max-w-none rounded-t-card rounded-b-none",
          side === "right"
            ? "sm:m-0 sm:ml-auto sm:h-dvh sm:max-h-none sm:w-[26rem] sm:rounded-none sm:rounded-l-card"
            : "sm:m-auto sm:w-[calc(100%-2rem)] sm:max-w-lg sm:rounded-card",
        );

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={description ? descId : undefined}
      onClick={(e) => {
        if (dismissible && e.target === e.currentTarget) onOpenChange(false);
      }}
      className={cn(
        "max-h-[88dvh] overflow-hidden border border-border bg-surface p-0 text-foreground shadow-xl backdrop:bg-black/45 open:flex open:flex-col",
        position,
        className,
      )}
    >
      {variant === "drawer" && <span aria-hidden className="mx-auto mt-2 h-1.5 w-10 shrink-0 rounded-full bg-border sm:hidden" />}
      <div className="flex items-start gap-3 px-5 pt-4">
        <div className={cn("min-w-0 flex-1", hideTitle && "sr-only")}>
          <h2 id={titleId} className="text-lg font-semibold">
            {title}
          </h2>
          {description && (
            <p id={descId} className="mt-1 text-sm text-muted-foreground">
              {description}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={() => onOpenChange(false)}
          aria-label={t("close")}
          className="ml-auto grid size-9 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-surface-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <X className="size-4" aria-hidden />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
      {footer && (
        <div className="flex flex-wrap justify-end gap-2 border-t border-border px-5 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          {footer}
        </div>
      )}
    </dialog>
  );
}

/** Centered modal dialog. Controlled: `open` + `onOpenChange`. */
export function Dialog(props: OverlayProps) {
  return <Shell variant="dialog" {...props} />;
}

/** Bottom sheet on mobile; on ≥ sm a right side panel (`side="right"`, default) or centered (`side="center"`). */
export function Drawer({ side = "right", ...props }: OverlayProps & { side?: "right" | "center" }) {
  return <Shell variant="drawer" side={side} {...props} />;
}
