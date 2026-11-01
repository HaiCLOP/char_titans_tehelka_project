"use client";

import { useRef, useState, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { ArrowRight, Building2, Droplets, ImagePlus, PenLine, Sparkles, X, Zap } from "lucide-react";
import { Avatar, buttonVariants } from "@/components/ui";

/** Key /report reads to prefill the description (kept out of the URL so complaint text never lands in logs). */
export const REPORT_DRAFT_KEY = "cs_report_draft";
/** Key /report reads to prefill an attached photo from the dashboard composer. */
export const REPORT_PHOTO_DRAFT_KEY = "cs_report_photo_draft";

/** "What needs fixing?" — starts a report from the home page without leaving the flow. */
export function HomeComposer({ name, avatar }: { name: string | null; avatar?: { id: string; character: number | null; src: string | null } | null }) {
  const t = useTranslations("home");
  const locale = useLocale();
  const router = useRouter();

  const [text, setText] = useState("");
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoName, setPhotoName] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handlePhotoSelect = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setPhotoName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        setPhotoPreview(reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  const removePhoto = () => {
    setPhotoPreview(null);
    setPhotoName(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const applyStarter = (prefix: string) => {
    setText((prev) => {
      const next = prev.trim() ? `${prev} · ${prefix}` : prefix;
      return next;
    });
    textareaRef.current?.focus();
  };

  const go = () => {
    try {
      if (text.trim()) {
        sessionStorage.setItem(REPORT_DRAFT_KEY, text.trim());
      }
      if (photoPreview) {
        sessionStorage.setItem(REPORT_PHOTO_DRAFT_KEY, photoPreview);
      }
    } catch {
      /* private mode: the report page simply starts empty */
    }
    router.push("/report");
  };

  const starters = locale === "as" ? [
    { label: "পানী", icon: Droplets, prompt: "পানী যোগান বা বাথৰুমৰ সমস্যা: " },
    { label: "বিদ্যুৎ", icon: Zap, prompt: "বিদ্যুৎ বা লাইটৰ সমস্যা: " },
    { label: "আন্তঃগাঁথনি", icon: Building2, prompt: "ভঙা বেঞ্চ, দুৱাৰ বা খিৰিকী: " },
    { label: "পৰিষ্কাৰতা", icon: Sparkles, prompt: "চৌহদ পৰিষ্কাৰ কৰাৰ প্ৰয়োজন: " },
  ] : [
    { label: "Water", icon: Droplets, prompt: "Water supply or washroom issue: " },
    { label: "Electricity", icon: Zap, prompt: "Power outage or streetlight broken: " },
    { label: "Infrastructure", icon: Building2, prompt: "Broken bench, door or ceiling: " },
    { label: "Cleanliness", icon: Sparkles, prompt: "Garbage clearance needed near: " },
  ];

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        go();
      }}
      className="group relative overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-surface via-surface to-surface-muted/40 p-4 sm:p-5 shadow-xs transition-all hover:border-border-strong"
    >
      {/* Top Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          {name ? (
            <Avatar name={name} src={avatar?.src} characterId={avatar?.character} seed={avatar?.id} size="md" decorative />
          ) : (
            <span
              className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary shadow-2xs"
              aria-hidden
            >
              <PenLine className="size-4" strokeWidth={2} />
            </span>
          )}
          <div className="min-w-0">
            <h2 className="text-sm sm:text-base font-bold text-foreground tracking-tight">
              {t("composeTitle")}
            </h2>
            <p className="text-xs text-muted-foreground line-clamp-1">{t("composeHint")}</p>
          </div>
        </div>

        {/* AI Tag */}
        <span className="hidden sm:inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/10 px-2.5 py-0.5 text-[11px] font-semibold text-primary shrink-0">
          <Sparkles className="size-3" aria-hidden />
          <span>{locale === "as" ? "স্বয়ংক্ৰিয় এআই" : "AI Auto-Triage"}</span>
        </span>
      </div>

      {/* Quick Prompt Starter Pills */}
      <div className="mt-3.5 flex items-center gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none]">
        <span className="text-[11px] font-medium text-muted-foreground mr-0.5 shrink-0">
          {locale === "as" ? "দ্ৰুত বাছনি:" : "Quick add:"}
        </span>
        {starters.map((s, idx) => {
          const Icon = s.icon;
          return (
            <button
              key={idx}
              type="button"
              onClick={() => applyStarter(s.prompt)}
              className="inline-flex h-6 shrink-0 items-center gap-1 rounded-full border border-border bg-surface px-2.5 text-[11px] font-medium text-muted-foreground hover:border-primary/50 hover:text-foreground transition-colors"
            >
              <Icon className="size-2.5 text-primary" aria-hidden />
              <span>{s.label}</span>
            </button>
          );
        })}
      </div>

      {/* Main Textarea */}
      <div className="relative mt-2.5">
        <label className="sr-only" htmlFor="home-compose">
          {t("composeTitle")}
        </label>
        <textarea
          ref={textareaRef}
          id="home-compose"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
              e.preventDefault();
              go();
            }
          }}
          rows={3}
          maxLength={2000}
          placeholder={t("composePlaceholder")}
          className="block w-full resize-none rounded-xl border border-border bg-surface px-3.5 py-2.5 text-sm leading-relaxed placeholder:text-muted-foreground/70 outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/15"
        />
      </div>

      {/* Photo Preview Strip (if attached) */}
      {photoPreview && (
        <div className="mt-2.5 flex items-center justify-between rounded-xl border border-border/80 bg-surface-muted/50 p-2 text-xs">
          <div className="flex items-center gap-2.5 min-w-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photoPreview} alt="Attached thumbnail" className="size-9 rounded-lg object-cover border border-border shrink-0" />
            <div className="min-w-0">
              <span className="block truncate font-medium text-foreground text-xs">{photoName || "photo.jpg"}</span>
              <span className="text-[10px] text-muted-foreground">Ready to attach</span>
            </div>
          </div>
          <button
            type="button"
            onClick={removePhoto}
            className="grid size-7 place-items-center rounded-lg text-muted-foreground hover:bg-surface hover:text-foreground transition-colors"
            aria-label="Remove photo"
          >
            <X className="size-3.5" aria-hidden />
          </button>
        </div>
      )}

      {/* Hidden File Input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handlePhotoSelect}
      />

      {/* Bottom Actions */}
      <div className="mt-3.5 flex items-center justify-between gap-3 border-t border-border/60 pt-3">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:bg-surface-muted hover:text-foreground transition-colors"
        >
          <ImagePlus className="size-4 text-primary" aria-hidden />
          <span>{photoPreview ? (locale === "as" ? "ফটো সলনি কৰক" : "Change photo") : t("addPhoto")}</span>
        </button>

        <button
          type="submit"
          className={buttonVariants({
            variant: "primary",
            size: "sm",
            className: "rounded-full px-4 h-9 gap-1.5 font-semibold shadow-xs hover:opacity-95 transition-all",
          })}
        >
          <span>{t("continue")}</span>
          <ArrowRight className="size-3.5" aria-hidden />
        </button>
      </div>
    </form>
  );
}
