"use client";
import { useEffect, useId, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Camera, ImagePlus, Loader2, X } from "lucide-react";
import { compressImage } from "@/lib/image";
import { cn, toLocaleDigits } from "@/lib/utils";
import { Field } from "./form";

export type PhotoItem = {
  id: string;
  /** Compressed WebP (or JPEG fallback) ≤ 400 KB, ready for POST /api/upload. */
  blob: Blob;
  /** Object URL for previews. Revoked by the dropzone when the photo is removed. */
  url: string;
  name: string;
};

export type PhotoDropzoneProps = {
  value: PhotoItem[];
  onChange: (photos: PhotoItem[]) => void;
  /** Default 3 (PRD S05). */
  max?: number;
  label?: React.ReactNode;
  hint?: React.ReactNode;
  error?: React.ReactNode;
  disabled?: boolean;
  id?: string;
  className?: string;
};

let seq = 0;
const newId = () => `p${Date.now().toString(36)}${(seq++).toString(36)}`;

/**
 * 0–max photos: "Take photo" (camera on mobile via capture="environment"), "Choose" (gallery) and drag-and-drop.
 * Files are compressed in the browser before they reach `onChange`.
 */
export function PhotoDropzone({ value, onChange, max = 3, label, hint, error, disabled, id: idProp, className }: PhotoDropzoneProps) {
  const t = useTranslations("ui.photo");
  const locale = useLocale();
  const auto = useId();
  const id = idProp ?? auto;
  const cameraRef = useRef<HTMLInputElement>(null);
  const pickRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(0);
  const [drag, setDrag] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const latest = useRef(value);
  useEffect(() => {
    latest.current = value;
  }, [value]);

  const room = max - value.length - busy;
  const full = room <= 0;

  async function add(files: FileList | File[] | null) {
    if (!files || disabled) return;
    setLocalError(null);
    const list = Array.from(files);
    const images = list.filter((f) => f.type.startsWith("image/"));
    if (images.length < list.length) setLocalError(t("invalid"));
    const take = images.slice(0, Math.max(0, room));
    if (images.length > take.length) setLocalError(t("tooMany", { max: toLocaleDigits(max, locale) }));
    if (take.length === 0) return;
    setBusy((b) => b + take.length);
    const results = await Promise.all(
      take.map(async (file) => {
        try {
          const blob = await compressImage(file);
          return { id: newId(), blob, url: URL.createObjectURL(blob), name: file.name } satisfies PhotoItem;
        } catch {
          return null;
        } finally {
          setBusy((b) => b - 1);
        }
      }),
    );
    const ok = results.filter((r): r is PhotoItem => r !== null);
    if (ok.length < take.length) setLocalError(t("invalid"));
    onChange([...latest.current, ...ok].slice(0, max));
  }

  function remove(item: PhotoItem) {
    URL.revokeObjectURL(item.url);
    onChange(latest.current.filter((p) => p.id !== item.id));
  }

  const shownError = error ?? localError;

  return (
    <Field
      id={id}
      label={label}
      hint={hint ?? t("hint", { max: toLocaleDigits(max, locale) })}
      error={shownError}
      aside={`${toLocaleDigits(value.length, locale)} / ${toLocaleDigits(max, locale)}`}
      className={className}
    >
      <div
        id={id}
        role="group"
        aria-busy={busy > 0 || undefined}
        onDragOver={(e) => {
          if (disabled || full) return;
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          void add(e.dataTransfer.files);
        }}
        className={cn(
          "rounded-card border-2 border-dashed border-border bg-surface-muted/50 p-3 transition",
          drag && "border-primary bg-primary-soft",
          disabled && "opacity-60",
        )}
      >
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {value.map((p, i) => (
            <div key={p.id} className="relative aspect-square overflow-hidden rounded-xl border border-border bg-surface">
              {/* eslint-disable-next-line @next/next/no-img-element -- local object URL preview */}
              <img src={p.url} alt={t("preview", { n: toLocaleDigits(i + 1, locale) })} className="size-full object-cover" />
              <button
                type="button"
                onClick={() => remove(p)}
                disabled={disabled}
                aria-label={t("remove", { n: toLocaleDigits(i + 1, locale) })}
                className="absolute top-1 right-1 grid size-7 place-items-center rounded-full bg-black/60 text-white hover:bg-black/75 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <X className="size-3.5" aria-hidden />
              </button>
            </div>
          ))}
          {Array.from({ length: busy }, (_, i) => (
            <div key={`busy-${i}`} className="grid aspect-square place-items-center rounded-xl border border-border bg-surface text-muted-foreground">
              <Loader2 className="size-5 animate-spin" aria-hidden />
              <span className="sr-only">{t("compressing")}</span>
            </div>
          ))}
          {!full && (
            <>
              <button
                type="button"
                disabled={disabled}
                onClick={() => cameraRef.current?.click()}
                className="flex aspect-square flex-col items-center justify-center gap-1 rounded-xl border border-border bg-surface px-1 text-center text-xs font-medium text-primary transition hover:bg-primary-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:hidden"
              >
                <Camera className="size-5" aria-hidden />
                {t("camera")}
              </button>
              <button
                type="button"
                disabled={disabled}
                onClick={() => pickRef.current?.click()}
                className="flex aspect-square flex-col items-center justify-center gap-1 rounded-xl border border-border bg-surface px-1 text-center text-xs font-medium text-primary transition hover:bg-primary-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <ImagePlus className="size-5" aria-hidden />
                {t("add")}
              </button>
            </>
          )}
        </div>
        <p className="mt-2 hidden text-xs text-muted-foreground sm:block">{t("drop")}</p>
        <input
          ref={cameraRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="sr-only"
          tabIndex={-1}
          aria-hidden
          onChange={(e) => {
            void add(e.target.files);
            e.target.value = "";
          }}
        />
        <input
          ref={pickRef}
          type="file"
          accept="image/*"
          multiple
          className="sr-only"
          tabIndex={-1}
          aria-hidden
          onChange={(e) => {
            void add(e.target.files);
            e.target.value = "";
          }}
        />
      </div>
    </Field>
  );
}
