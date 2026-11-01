"use client";
import { useId } from "react";
import { useLocale } from "next-intl";
import { ChevronDown } from "lucide-react";
import { cn, toLocaleDigits } from "@/lib/utils";

/* ---------- Field: label + control + hint + error ---------- */

export type FieldProps = {
  /** id of the control inside; label points at it. */
  id: string;
  label?: React.ReactNode;
  hint?: React.ReactNode;
  error?: React.ReactNode;
  required?: boolean;
  /** Extra right-aligned text on the label row (e.g. a character counter). */
  aside?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
};

export const hintId = (id: string) => `${id}-hint`;
export const errorId = (id: string) => `${id}-error`;

/** aria-describedby value for a control rendered inside <Field>. */
export function describedBy(id: string, hint?: unknown, error?: unknown) {
  return [hint ? hintId(id) : null, error ? errorId(id) : null].filter(Boolean).join(" ") || undefined;
}

export function Field({ id, label, hint, error, required, aside, className, children }: FieldProps) {
  return (
    <div className={cn("space-y-1.5", className)}>
      {(label || aside) && (
        <div className="flex items-baseline justify-between gap-3">
          {label && (
            <label htmlFor={id} className="text-sm font-medium">
              {label}
              {required && (
                <span className="ml-0.5 text-danger" aria-hidden>
                  *
                </span>
              )}
            </label>
          )}
          {aside && <span className="text-xs text-muted-foreground">{aside}</span>}
        </div>
      )}
      {children}
      {hint && !error && (
        <p id={hintId(id)} className="text-xs text-muted-foreground">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId(id)} role="alert" className="text-xs font-medium text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

const control =
  "w-full min-w-0 rounded-field border border-border bg-surface px-4 text-base text-foreground transition-[border-color,box-shadow] duration-200 placeholder:text-subtle-foreground hover:border-border-strong focus-visible:border-foreground/40 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-foreground/[0.06] disabled:cursor-not-allowed disabled:opacity-60 aria-invalid:border-danger sm:text-[0.9375rem]";

type FieldBits = { label?: React.ReactNode; hint?: React.ReactNode; error?: React.ReactNode; fieldClassName?: string };

/* ---------- Input ---------- */

export type InputProps = React.ComponentProps<"input"> & FieldBits;

export function Input({ id: idProp, label, hint, error, fieldClassName, className, required, ...props }: InputProps) {
  const auto = useId();
  const id = idProp ?? auto;
  return (
    <Field id={id} label={label} hint={hint} error={error} required={required} className={fieldClassName}>
      <input
        id={id}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, hint, error)}
        className={cn(control, "h-11", className)}
        {...props}
      />
    </Field>
  );
}

/* ---------- Textarea ---------- */

export type TextareaProps = React.ComponentProps<"textarea"> & FieldBits & {
  /** Show "used / max" next to the label (needs `maxLength` and a controlled `value`). */
  showCount?: boolean;
};

export function Textarea({ id: idProp, label, hint, error, fieldClassName, className, required, showCount, maxLength, value, ...props }: TextareaProps) {
  const auto = useId();
  const locale = useLocale();
  const id = idProp ?? auto;
  const used = typeof value === "string" ? value.length : 0;
  const aside = showCount && maxLength ? `${toLocaleDigits(used, locale)} / ${toLocaleDigits(maxLength, locale)}` : undefined;
  return (
    <Field id={id} label={label} hint={hint} error={error} required={required} aside={aside} className={fieldClassName}>
      <textarea
        id={id}
        required={required}
        maxLength={maxLength}
        value={value}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, hint, error)}
        className={cn(control, "min-h-28 resize-y py-3 leading-relaxed", className)}
        {...props}
      />
    </Field>
  );
}

/* ---------- Select (native: best on mobile + accessible) ---------- */

export type SelectOption = { value: string; label: string; disabled?: boolean };
export type SelectProps = Omit<React.ComponentProps<"select">, "children"> & FieldBits & {
  options: SelectOption[];
  /** Adds a first empty option. */
  placeholder?: string;
};

export function Select({ id: idProp, label, hint, error, fieldClassName, className, required, options, placeholder, ...props }: SelectProps) {
  const auto = useId();
  const id = idProp ?? auto;
  return (
    <Field id={id} label={label} hint={hint} error={error} required={required} className={fieldClassName}>
      <div className="relative">
        <select
          id={id}
          required={required}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy(id, hint, error)}
          className={cn(control, "h-11 appearance-none pr-10", className)}
          {...props}
        >
          {placeholder !== undefined && <option value="">{placeholder}</option>}
          {options.map((o) => (
            <option key={o.value} value={o.value} disabled={o.disabled} className="bg-surface text-foreground">
              {o.label}
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute top-1/2 right-3.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
      </div>
    </Field>
  );
}

/* ---------- Switch ---------- */

export type SwitchProps = {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  label: React.ReactNode;
  description?: React.ReactNode;
  disabled?: boolean;
  id?: string;
  className?: string;
};

/** role="switch" button with a label + one-line description (whole row is clickable). */
export function Switch({ checked, onCheckedChange, label, description, disabled, id: idProp, className }: SwitchProps) {
  const auto = useId();
  const id = idProp ?? auto;
  return (
    <div className={cn("flex items-start justify-between gap-4", disabled && "opacity-60", className)}>
      <div className="min-w-0">
        <label htmlFor={id} className={cn("text-sm font-medium", !disabled && "cursor-pointer")}>
          {label}
        </label>
        {description && (
          <p id={`${id}-desc`} className="mt-0.5 text-xs text-muted-foreground">
            {description}
          </p>
        )}
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-describedby={description ? `${id}-desc` : undefined}
        disabled={disabled}
        onClick={() => onCheckedChange(!checked)}
        className={cn(
          "relative mt-0.5 inline-flex h-6 w-11 shrink-0 items-center rounded-full border border-transparent transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed",
          checked ? "bg-primary" : "bg-border-strong",
        )}
      >
        <span
          aria-hidden
          className={cn(
            "inline-block size-5 rounded-full bg-surface shadow-sm transition-transform",
            checked ? "translate-x-5" : "translate-x-0.5",
          )}
        />
      </button>
    </div>
  );
}
