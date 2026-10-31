"use client";
import { useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Button, Dialog } from "@/components/ui";
import { CharacterSprite } from "@/components/ui/character-avatar";
import { CHARACTER_COUNT } from "@/lib/campus";
import { cn, toLocaleDigits } from "@/lib/utils";

const STYLES = ["scout", "wizard", "robot", "fox", "knight", "pirate"] as const;

/** Dialog with the 60 pixel characters as a radio group (arrow keys move, Enter/Space pick) and a pinned Save. */
export function CharacterPicker({
  open, onOpenChange, value, onSave, saving,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  /** Current character (saved or derived default). */
  value: number;
  onSave: (id: number) => void;
  saving: boolean;
}) {
  const t = useTranslations("profile");
  const locale = useLocale();
  const [picked, setPicked] = useState(value);
  const [prevOpen, setPrevOpen] = useState(open);
  const grid = useRef<HTMLDivElement>(null);
  // Re-sync the selection each time the dialog opens.
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) setPicked(value);
  }

  const label = (id: number) =>
    t("characterOption", { style: t(`characterStyle.${STYLES[Math.floor(id / 10)]}`), n: toLocaleDigits((id % 10) + 1, locale) });

  const onKey = (e: React.KeyboardEvent) => {
    const buttons = Array.from(grid.current?.querySelectorAll<HTMLButtonElement>("[role=radio]") ?? []);
    if (!buttons.length) return;
    const top = buttons[0].offsetTop;
    const cols = Math.max(1, buttons.findIndex((b) => b.offsetTop !== top) === -1 ? buttons.length : buttons.findIndex((b) => b.offsetTop !== top));
    const delta = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: cols, ArrowUp: -cols, Home: -picked, End: CHARACTER_COUNT - 1 - picked }[e.key];
    if (delta === undefined) return;
    e.preventDefault();
    const next = Math.max(0, Math.min(CHARACTER_COUNT - 1, picked + delta));
    setPicked(next);
    buttons[next]?.focus();
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={t("characterPick")}
      description={t("characterHint")}
      className="sm:max-w-2xl"
      footer={
        <>
          <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
            {t("characterCancel")}
          </Button>
          <Button type="button" loading={saving} disabled={picked === value} onClick={() => onSave(picked)}>
            {t("characterSave")}
          </Button>
        </>
      }
    >
      <div ref={grid} role="radiogroup" aria-label={t("characterPick")} onKeyDown={onKey} className="grid grid-cols-6 gap-1.5 sm:grid-cols-10">
        {Array.from({ length: CHARACTER_COUNT }, (_, id) => {
          const on = id === picked;
          return (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={on}
              aria-label={label(id)}
              title={label(id)}
              tabIndex={on ? 0 : -1}
              onClick={() => setPicked(id)}
              className={cn(
                "grid h-12 place-items-center rounded-xl border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                on ? "border-foreground bg-surface ring-1 ring-foreground" : "border-transparent bg-surface-muted hover:border-border-strong",
              )}
            >
              <CharacterSprite id={id} size={36} />
            </button>
          );
        })}
      </div>
    </Dialog>
  );
}
