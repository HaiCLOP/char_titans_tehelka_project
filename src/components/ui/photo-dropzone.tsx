"use client";
import { useEffect, useId, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { AlertTriangle, Camera, ImagePlus, Loader2, RefreshCw, ShieldAlert, X } from "lucide-react";
import { cn, toLocaleDigits } from "@/lib/utils";
import { Dialog } from "./dialog";
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
 * 0–max photos: "Take photo" (live camera on desktop/webcam & mobile capture="environment"), "Choose" (files), and drag-and-drop.
 * Rejects OSINT / web stock images and requires authentic live campus captures.
 */
export function PhotoDropzone({ value, onChange, max = 3, label, hint, error, disabled, id: idProp, className }: PhotoDropzoneProps) {
  const t = useTranslations("ui.photo");
  const tc = useTranslations("ui");
  const locale = useLocale();
  const auto = useId();
  const id = idProp ?? auto;
  const cameraRef = useRef<HTMLInputElement>(null);
  const pickRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const busy = 0;
  const [drag, setDrag] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  // Camera modal state
  const [cameraModalOpen, setCameraModalOpen] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<"environment" | "user">("environment");

  const latest = useRef(value);
  useEffect(() => {
    latest.current = value;
  }, [value]);

  const room = max - value.length - busy;
  const full = room <= 0;

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  };

  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);

  const startCamera = async (facing: "environment" | "user" = facingMode) => {
    stopCamera();
    setCameraError(null);
    try {
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: facing },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
          audio: false,
        });
      } catch {
        // Fallback constraint if high-res profile is rejected by mobile hardware
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: facing },
          audio: false,
        });
      }
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        void videoRef.current.play().catch(() => {});
      }
    } catch (err) {
      console.warn("[camera] getUserMedia failed:", err);
      setCameraError(t("cameraError"));
    }
  };

  const handleCameraClick = () => {
    if (disabled || full) return;

    // Use live in-app camera on both mobile and desktop to bypass file manager
    if (typeof navigator !== "undefined" && Boolean(navigator.mediaDevices?.getUserMedia)) {
      setCameraModalOpen(true);
      void startCamera(facingMode);
    } else {
      cameraRef.current?.click();
    }
  };

  const captureSnapshot = () => {
    const video = videoRef.current;
    if (!video) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(
      (blob) => {
        if (blob) {
          const file = new File([blob], `live-photo-${Date.now()}.jpg`, { type: "image/jpeg" });
          void add([file]);
          stopCamera();
          setCameraModalOpen(false);
        }
      },
      "image/jpeg",
      0.92,
    );
  };

  const switchCameraFacing = () => {
    const next = facingMode === "environment" ? "user" : "environment";
    setFacingMode(next);
    void startCamera(next);
  };

  async function add(files: FileList | File[] | null) {
    if (!files || disabled) return;
    setLocalError(null);
    const list = Array.from(files);
    const images = list.filter((f) => f.type.startsWith("image/"));
    if (images.length < list.length) setLocalError(t("invalid"));
    const take = images.slice(0, Math.max(0, room));
    if (images.length > take.length) setLocalError(t("tooMany", { max: toLocaleDigits(max, locale) }));
    if (take.length === 0) return;
    // Preserve untouched original file as primary evidence to maintain C2PA / EXIF / SHA-256 provenance (Item 5)
    const ok: PhotoItem[] = take.map((file) => ({
      id: newId(),
      blob: file,
      url: URL.createObjectURL(file),
      name: file.name,
    }));
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
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
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
              {/* Take Photo button: prominent on mobile & desktop */}
              <button
                type="button"
                disabled={disabled}
                onClick={handleCameraClick}
                className="flex aspect-square flex-col items-center justify-center gap-1.5 rounded-xl border border-primary/30 bg-primary/5 px-2 text-center text-xs font-semibold text-primary transition hover:bg-primary/10 hover:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className="grid size-9 place-items-center rounded-full bg-primary text-primary-foreground shadow-xs">
                  <Camera className="size-4.5" strokeWidth={2.2} aria-hidden />
                </span>
                <span className="leading-tight">{t("camera")}</span>
              </button>

              {/* Choose from files */}
              <button
                type="button"
                disabled={disabled}
                onClick={() => pickRef.current?.click()}
                className="flex aspect-square flex-col items-center justify-center gap-1.5 rounded-xl border border-border bg-surface px-2 text-center text-xs font-medium text-foreground transition hover:bg-surface-muted hover:border-border-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className="grid size-9 place-items-center rounded-full bg-surface-muted text-muted-foreground">
                  <ImagePlus className="size-4.5" aria-hidden />
                </span>
                <span className="leading-tight">{t("add")}</span>
              </button>
            </>
          )}
        </div>

        {/* Anti-OSINT & Authentic Photo Policy Notice */}
        <div className="mt-3 flex items-center gap-2 rounded-xl border border-border/80 bg-surface px-3 py-2 text-xs text-muted-foreground shadow-2xs">
          <ShieldAlert className="size-3.5 shrink-0 text-primary" aria-hidden />
          <span className="min-w-0 flex-1 leading-snug">{t("osintNotice")}</span>
        </div>

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

      {/* Live Camera Viewfinder Modal */}
      <Dialog
        open={cameraModalOpen}
        onOpenChange={(o) => {
          if (!o) {
            stopCamera();
            setCameraModalOpen(false);
          }
        }}
        title={t("takeLive")}
        description={t("osintNotice")}
      >
        <div className="space-y-4">
          <div className="relative aspect-[4/3] w-full overflow-hidden rounded-2xl bg-black shadow-inner">
            <video
              ref={(el) => {
                videoRef.current = el;
                if (el && streamRef.current && el.srcObject !== streamRef.current) {
                  el.srcObject = streamRef.current;
                }
              }}
              autoPlay
              playsInline
              muted
              className="size-full object-cover"
            />
            {/* Viewfinder Reticle */}
            <div className="pointer-events-none absolute inset-4 rounded-xl border border-white/20" />
            <div className="pointer-events-none absolute top-1/2 left-1/2 size-12 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/40" />

            {cameraError && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/85 p-6 text-center text-white">
                <AlertTriangle className="size-8 text-danger" />
                <p className="text-xs text-white/90">{cameraError}</p>
                <button
                  type="button"
                  onClick={() => {
                    stopCamera();
                    setCameraModalOpen(false);
                    pickRef.current?.click();
                  }}
                  className="rounded-full bg-white px-4 py-1.5 text-xs font-semibold text-black hover:bg-white/90"
                >
                  {t("add")}
                </button>
              </div>
            )}
          </div>

          {!cameraError && (
            <div className="flex items-center justify-center gap-6 py-2">
              <button
                type="button"
                onClick={switchCameraFacing}
                title={t("switchCam")}
                className="grid size-11 place-items-center rounded-full border border-border bg-surface text-foreground transition hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <RefreshCw className="size-4" />
                <span className="sr-only">{t("switchCam")}</span>
              </button>

              <button
                type="button"
                onClick={captureSnapshot}
                className="group grid size-16 place-items-center rounded-full border-4 border-primary p-1 shadow-md transition-transform active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className="grid size-full place-items-center rounded-full bg-primary text-primary-foreground group-hover:bg-primary/90">
                  <Camera className="size-6" />
                </span>
                <span className="sr-only">{t("snap")}</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  stopCamera();
                  setCameraModalOpen(false);
                }}
                className="grid size-11 place-items-center rounded-full border border-border bg-surface text-muted-foreground transition hover:bg-surface-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <X className="size-5" />
                <span className="sr-only">{tc("close")}</span>
              </button>
            </div>
          )}
        </div>
      </Dialog>
    </Field>
  );
}
