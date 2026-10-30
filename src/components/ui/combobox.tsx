"use client";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Check, ChevronsUpDown, Loader2, X } from "lucide-react";
import { matchesQuery } from "@/lib/search";
import { cn } from "@/lib/utils";
import { Field, describedBy } from "./form";

export type ComboboxProps<T> = {
  value: T | null;
  onChange: (value: T | null) => void;
  /** Static options, filtered client-side with `getSearchText` (works for Assamese and English). */
  options?: T[];
  /** Async options for a query (debounced 200 ms, stale responses ignored). Used instead of `options`. */
  loadOptions?: (query: string, signal: AbortSignal) => Promise<T[]>;
  getKey: (item: T) => string;
  /** Text shown in the input and list. */
  getLabel: (item: T) => string;
  /** Text searched over; default `getLabel`. For bilingual rows return `name_en + " " + name_as`. */
  getSearchText?: (item: T) => string;
  /** Custom option row (label stays the accessible name). */
  renderOption?: (item: T, state: { active: boolean; selected: boolean }) => React.ReactNode;
  label?: React.ReactNode;
  hint?: React.ReactNode;
  error?: React.ReactNode;
  placeholder?: string;
  emptyText?: React.ReactNode;
  disabled?: boolean;
  required?: boolean;
  id?: string;
  className?: string;
  /** Max rows rendered. Default 50. */
  limit?: number;
};

/** WAI-ARIA combobox (list autocomplete). ↑/↓ move, Enter selects, Esc closes/clears the query. */
export function Combobox<T>({
  value, onChange, options, loadOptions, getKey, getLabel, getSearchText, renderOption,
  label, hint, error, placeholder, emptyText, disabled, required, id: idProp, className, limit = 50,
}: ComboboxProps<T>) {
  const t = useTranslations("ui.combobox");
  const auto = useId();
  const id = idProp ?? auto;
  const listId = `${id}-list`;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [remote, setRemote] = useState<T[]>([]);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const loaderRef = useRef(loadOptions);
  useEffect(() => {
    loaderRef.current = loadOptions;
  }, [loadOptions]);

  const isAsync = !!loadOptions;

  // Async search (debounced). setState calls happen only inside the timer/promise callbacks.
  useEffect(() => {
    if (!isAsync || !open) return;
    const ctrl = new AbortController();
    const timer = setTimeout(() => {
      setLoading(true);
      setFailed(false);
      loaderRef.current!(query, ctrl.signal)
        .then((items) => {
          if (!ctrl.signal.aborted) setRemote(items);
        })
        .catch(() => {
          if (!ctrl.signal.aborted) setFailed(true);
        })
        .finally(() => {
          if (!ctrl.signal.aborted) setLoading(false);
        });
    }, 200);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [query, open, isAsync]);

  const items = useMemo(() => {
    const src = isAsync ? remote : (options ?? []);
    const search = getSearchText ?? getLabel;
    const filtered = isAsync ? src : src.filter((o) => matchesQuery(search(o), query));
    return filtered.slice(0, limit);
  }, [isAsync, remote, options, query, getSearchText, getLabel, limit]);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  // Keep the active option scrolled into view.
  useEffect(() => {
    if (!open) return;
    listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  const choose = (item: T) => {
    onChange(item);
    setQuery("");
    setOpen(false);
    inputRef.current?.focus();
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!open) setOpen(true);
      else setActive((a) => Math.min(a + 1, items.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Home" && open) {
      setActive(0);
    } else if (e.key === "End" && open) {
      setActive(Math.max(items.length - 1, 0));
    } else if (e.key === "Enter") {
      if (open && items[active]) {
        e.preventDefault();
        choose(items[active]);
      }
    } else if (e.key === "Escape") {
      if (open) {
        e.preventDefault();
        setOpen(false);
        setQuery("");
      }
    } else if (e.key === "Tab") {
      setOpen(false);
      setQuery("");
    }
  };

  const shown = open ? query : value ? getLabel(value) : "";
  const activeId = open && items[active] ? `${id}-opt-${getKey(items[active])}` : undefined;
  const selectedKey = value ? getKey(value) : null;

  return (
    <Field id={id} label={label} hint={hint} error={error} required={required} className={className}>
      <div ref={wrapRef} className="relative">
        <input
          ref={inputRef}
          id={id}
          type="text"
          role="combobox"
          autoComplete="off"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={listId}
          aria-activedescendant={activeId}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy(id, hint, error)}
          aria-required={required || undefined}
          disabled={disabled}
          placeholder={placeholder ?? t("placeholder")}
          value={shown}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onClick={() => setOpen(true)}
          onKeyDown={onKeyDown}
          className="h-11 w-full min-w-0 rounded-xl border border-border bg-surface pr-16 pl-3.5 text-base text-foreground shadow-sm transition placeholder:text-muted-foreground focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 disabled:opacity-60 aria-invalid:border-p1 sm:text-sm"
        />
        <div className="absolute inset-y-0 right-2 flex items-center gap-0.5">
          {loading && <Loader2 className="size-4 animate-spin text-muted-foreground" aria-hidden />}
          {value && !disabled && (
            <button
              type="button"
              aria-label={t("clear")}
              onClick={() => {
                onChange(null);
                setQuery("");
                inputRef.current?.focus();
              }}
              className="grid size-7 place-items-center rounded-full text-muted-foreground hover:bg-surface-muted hover:text-foreground"
            >
              <X className="size-3.5" aria-hidden />
            </button>
          )}
          <ChevronsUpDown className="mr-1 size-4 text-muted-foreground" aria-hidden />
        </div>
        <ul
          ref={listRef}
          id={listId}
          role="listbox"
          aria-label={typeof label === "string" ? label : undefined}
          hidden={!open}
          className="absolute inset-x-0 top-full z-30 mt-1.5 max-h-64 overflow-y-auto rounded-xl border border-border bg-surface p-1 shadow-lg"
        >
          {items.map((item, i) => {
            const key = getKey(item);
            const isActive = i === active;
            const isSelected = key === selectedKey;
            return (
              <li
                key={key}
                id={`${id}-opt-${key}`}
                role="option"
                aria-selected={isSelected}
                data-index={i}
                onPointerDown={(e) => e.preventDefault()}
                onClick={() => choose(item)}
                onPointerMove={() => setActive(i)}
                className={cn(
                  "flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm",
                  isActive ? "bg-primary-soft text-foreground" : "text-foreground",
                )}
              >
                <span className="min-w-0 flex-1">{renderOption ? renderOption(item, { active: isActive, selected: isSelected }) : getLabel(item)}</span>
                {isSelected && <Check className="size-4 shrink-0 text-primary" aria-hidden />}
              </li>
            );
          })}
          {items.length === 0 && (
            <li role="presentation" className="px-3 py-3 text-sm text-muted-foreground">
              {loading ? t("searching") : failed ? t("failed") : (emptyText ?? t("noResults"))}
            </li>
          )}
        </ul>
      </div>
    </Field>
  );
}
