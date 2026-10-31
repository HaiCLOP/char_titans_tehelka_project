"use client";
import { useId, useRef, useState } from "react";
import { useLocale } from "next-intl";
import { cn, toLocaleDigits } from "@/lib/utils";

export type TabItem<V extends string = string> = {
  value: V;
  label: React.ReactNode;
  /** Badge number (Assamese digits in Assamese). */
  count?: number;
  /** Optional panel content; if omitted, render the panel yourself based on `value`. */
  content?: React.ReactNode;
};

export type TabsProps<V extends string> = {
  items: TabItem<V>[];
  value?: V;
  defaultValue?: V;
  onValueChange?: (v: V) => void;
  /** Accessible name of the tablist. */
  label: string;
  className?: string;
  /** Stretch tabs to the full width (good for 2–3 tabs on mobile). */
  fill?: boolean;
};

/** WAI-ARIA tabs: ←/→/Home/End move focus and select (automatic activation). Controlled or uncontrolled. */
export function Tabs<V extends string>({ items, value, defaultValue, onValueChange, label, className, fill = false }: TabsProps<V>) {
  const locale = useLocale();
  const id = useId();
  const [inner, setInner] = useState<V | undefined>(defaultValue ?? items[0]?.value);
  const current = value ?? inner;
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  const select = (v: V) => {
    if (value === undefined) setInner(v);
    onValueChange?.(v);
  };
  const onKey = (e: React.KeyboardEvent, i: number) => {
    let next = -1;
    if (e.key === "ArrowRight") next = (i + 1) % items.length;
    else if (e.key === "ArrowLeft") next = (i - 1 + items.length) % items.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = items.length - 1;
    if (next < 0) return;
    e.preventDefault();
    refs.current[next]?.focus();
    select(items[next].value);
  };
  const active = items.find((i) => i.value === current);

  return (
    <div className={className}>
      <div
        role="tablist"
        aria-label={label}
        className={cn("flex max-w-full gap-1 overflow-x-auto rounded-full bg-surface-sunken/70 p-1 shadow-[inset_0_1px_2px_rgb(0_0_0/0.04)]", fill ? "w-full" : "w-fit")}
      >
        {items.map((item, i) => {
          const on = item.value === current;
          return (
            <button
              key={item.value}
              ref={(el) => {
                refs.current[i] = el;
              }}
              type="button"
              role="tab"
              id={`${id}-tab-${item.value}`}
              aria-selected={on}
              aria-controls={item.content !== undefined ? `${id}-panel-${item.value}` : undefined}
              tabIndex={on ? 0 : -1}
              onClick={() => select(item.value)}
              onKeyDown={(e) => onKey(e, i)}
              className={cn(
                "inline-flex h-9 items-center justify-center gap-1.5 rounded-full px-4 text-sm font-medium whitespace-nowrap transition-[background-color,color,box-shadow] duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                fill && "flex-1",
                on ? "bg-surface text-foreground shadow-sm ring-1 ring-border" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {item.label}
              {item.count !== undefined && (
                <span className={cn("rounded-full px-1.5 text-xs", on ? "bg-surface-muted text-muted-foreground" : "bg-surface/60")}>
                  {toLocaleDigits(item.count, locale)}
                </span>
              )}
            </button>
          );
        })}
      </div>
      {active?.content !== undefined && (
        <div
          role="tabpanel"
          id={`${id}-panel-${active.value}`}
          aria-labelledby={`${id}-tab-${active.value}`}
          tabIndex={0}
          className="mt-4 focus-visible:outline-none"
        >
          {active.content}
        </div>
      )}
    </div>
  );
}
