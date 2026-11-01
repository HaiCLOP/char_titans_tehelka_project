"use client";
/* eslint-disable @next/next/no-img-element -- private signed evidence URLs and original-resolution previews */

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Play, ZoomIn } from "lucide-react";
import { Card, CardHeader, Dialog } from "@/components/ui";
import { toLocaleDigits } from "@/lib/utils";

export function EvidenceGallery({ photos, videos = [] }: { photos: string[]; videos?: string[] }) {
  const t = useTranslations("evidence");
  const locale = useLocale();
  const [selected, setSelected] = useState<number | null>(null);
  const media = [...photos.map((src) => ({ src, video: false })), ...videos.map((src) => ({ src, video: true }))];
  const current = selected == null ? null : media[selected];
  const label = (index: number) => t(media[index].video ? "video" : "photo", { n: toLocaleDigits(index + 1, locale) });
  if (!media.length) return null;
  return <Card>
    <CardHeader title={t("title")} description={t("hint")} />
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {media.map((item, index) => <button type="button" key={`${index}-${item.src}`} onClick={() => setSelected(index)} aria-label={label(index)} className="group relative aspect-[4/3] overflow-hidden rounded-xl border border-border bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        {item.video ? <video src={item.src} preload="metadata" muted playsInline className="size-full object-contain" /> : <img src={item.src} alt={label(index)} loading="lazy" className="size-full object-contain transition-transform group-hover:scale-105" />}
        <span className="absolute bottom-2 left-2 inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-2 py-1 text-xs text-foreground">{item.video ? <Play className="size-3.5" strokeWidth={1.75} aria-hidden /> : <ZoomIn className="size-3.5" strokeWidth={1.75} aria-hidden />}{label(index)}</span>
      </button>)}
    </div>
    <Dialog open={current != null} onOpenChange={(open) => { if (!open) setSelected(null); }} title={selected == null ? t("title") : label(selected)} className="max-w-[min(94vw,72rem)]">
      {current && <div className="space-y-3">
        <div className="grid min-h-0 place-items-center overflow-hidden rounded-xl bg-surface-sunken">
          {current.video ? <video key={current.src} src={current.src} controls playsInline autoPlay className="max-h-[65dvh] w-full" /> : <img src={current.src} alt={label(selected!)} className="max-h-[65dvh] w-full object-contain" />}
        </div>
        <div className="flex items-center justify-between gap-3">
          <button type="button" disabled={selected === 0} onClick={() => setSelected((index) => Math.max(0, (index ?? 0) - 1))} className="min-h-10 rounded-full border border-border px-4 text-sm disabled:opacity-40">{t("previous")}</button>
          <span className="text-sm text-muted-foreground">{toLocaleDigits((selected ?? 0) + 1, locale)} / {toLocaleDigits(media.length, locale)}</span>
          <button type="button" disabled={selected === media.length - 1} onClick={() => setSelected((index) => Math.min(media.length - 1, (index ?? 0) + 1))} className="min-h-10 rounded-full border border-border px-4 text-sm disabled:opacity-40">{t("next")}</button>
        </div>
      </div>}
    </Dialog>
  </Card>;
}
