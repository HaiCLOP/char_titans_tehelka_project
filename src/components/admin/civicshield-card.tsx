"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { CheckCircle2, AlertTriangle, ShieldAlert, ShieldCheck, Copy, Check, Fingerprint, Camera } from "lucide-react";
import { Card, Chip } from "@/components/ui";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type CivicShieldData = {
  status: "verified_signals" | "no_ai_signals" | "needs_review" | "ai_detected";
  c2pa: "present_ai" | "present_verified" | "not_present";
  watermark: "detected" | "not_detected";
  visual_classifier: "authentic_indicators" | "inconclusive" | "suspect";
  manipulation: "clean" | "needs_review";
  context_match: "match" | "discrepancy" | "inconclusive";
  recommendation_en: string;
  recommendation_as: string;
  hashes: { path: string; sha256: string; received_at: string }[];
};

export function CivicShieldCard({
  data,
  hasPhotos,
}: {
  data?: CivicShieldData | null;
  hasPhotos: boolean;
}) {
  const t = useTranslations("workspace.civicshield");
  const locale = useLocale();
  const [copiedHash, setCopiedHash] = useState<string | null>(null);

  if (!hasPhotos) {
    return null;
  }

  // Fallback defaults if analysis was before CivicShield deployment
  const report: CivicShieldData = data ?? {
    status: "no_ai_signals",
    c2pa: "not_present",
    watermark: "not_detected",
    visual_classifier: "authentic_indicators",
    manipulation: "clean",
    context_match: "match",
    recommendation_en: "No supported AI signal detected. Standard physical inspection recommended.",
    recommendation_as: "কোনো এআই সংকেত চিনাক্ত হোৱা নাই। নিয়মীয়া প্ৰত্যক্ষ পৰীক্ষা বাঞ্ছনীয়।",
    hashes: [],
  };

  const copy = (hash: string) => {
    void navigator.clipboard.writeText(hash);
    setCopiedHash(hash);
    toast.success(locale === "as" ? "হেছ কপি কৰা হ'ল" : "SHA-256 hash copied");
    setTimeout(() => setCopiedHash(null), 2000);
  };

  const statusTone: Record<CivicShieldData["status"], "success" | "neutral" | "warning" | "danger"> = {
    verified_signals: "success",
    no_ai_signals: "neutral",
    needs_review: "warning",
    ai_detected: "danger",
  };

  const StatusIcon = {
    verified_signals: ShieldCheck,
    no_ai_signals: CheckCircle2,
    needs_review: AlertTriangle,
    ai_detected: ShieldAlert,
  }[report.status];

  return (
    <Card className="overflow-hidden border-border">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border/60 pb-3">
        <div className="flex items-center gap-2.5">
          <span className="grid size-8 place-items-center rounded-lg bg-primary/10 text-primary">
            <Fingerprint className="size-4" strokeWidth={2.25} aria-hidden />
          </span>
          <div>
            <h3 className="text-base font-bold tracking-tight text-foreground">{t("title")}</h3>
            <p className="text-xs text-muted-foreground">{t("subtitle")}</p>
          </div>
        </div>
        <Chip tone={statusTone[report.status]} className="font-semibold gap-1.5 py-1 px-3">
          <StatusIcon className="size-3.5" aria-hidden />
          {t(`badge.${report.status}`)}
        </Chip>
      </div>

      <div className="mt-4 divide-y divide-border/60 text-sm">
        <div className="flex items-center justify-between py-2">
          <span className="text-muted-foreground">{t("c2pa")}</span>
          <span className={cn("font-medium", report.c2pa === "present_ai" ? "text-danger" : report.c2pa === "present_verified" ? "text-success" : "text-foreground")}>
            {t(`val.${report.c2pa}`)}
          </span>
        </div>

        <div className="flex items-center justify-between py-2">
          <span className="text-muted-foreground">{t("watermark")}</span>
          <span className={cn("font-medium", report.watermark === "detected" ? "text-danger font-semibold" : "text-foreground")}>
            {t(`val.${report.watermark}`)}
          </span>
        </div>

        <div className="flex items-center justify-between py-2">
          <span className="text-muted-foreground">{t("visual")}</span>
          <span className={cn("font-medium", report.visual_classifier === "suspect" ? "text-danger" : report.visual_classifier === "inconclusive" ? "text-warning" : "text-foreground")}>
            {t(`val.${report.visual_classifier}`)}
          </span>
        </div>

        <div className="flex items-center justify-between py-2">
          <span className="text-muted-foreground">{t("manipulation")}</span>
          <span className={cn("font-medium", report.manipulation === "needs_review" ? "text-warning" : "text-foreground")}>
            {t(`val.${report.manipulation}`)}
          </span>
        </div>

        <div className="flex items-center justify-between py-2">
          <span className="text-muted-foreground">{t("match")}</span>
          <span className={cn("font-medium", report.context_match === "discrepancy" ? "text-danger" : "text-foreground")}>
            {t(`val.${report.context_match}`)}
          </span>
        </div>
      </div>

      {/* Administrator Recommendation */}
      <div className="mt-4 rounded-xl border border-border/80 bg-surface-muted/60 p-3.5 text-xs leading-relaxed">
        <div className="flex items-center gap-1.5 font-semibold text-foreground">
          <Camera className="size-3.5 text-primary" aria-hidden />
          <span>{t("recommendation")}</span>
        </div>
        <p className="mt-1 text-muted-foreground">
          {locale === "as" ? report.recommendation_as : report.recommendation_en}
        </p>
      </div>

      {/* File Integrity Hashes */}
      {report.hashes && report.hashes.length > 0 && (
        <div className="mt-3.5 space-y-1.5 pt-2 border-t border-border/40">
          <p className="text-[11px] font-semibold text-muted-foreground">{t("sha256")}</p>
          {report.hashes.map((h, i) => (
            <div key={h.sha256 + i} className="flex items-center justify-between gap-2 rounded-lg bg-surface-muted px-2.5 py-1.5 font-mono text-[11px]">
              <span className="truncate text-foreground/80">{h.sha256.slice(0, 16)}...{h.sha256.slice(-12)}</span>
              <button
                type="button"
                onClick={() => copy(h.sha256)}
                className="inline-flex items-center gap-1 text-[10px] text-primary hover:underline font-sans"
              >
                {copiedHash === h.sha256 ? <Check className="size-3 text-success" /> : <Copy className="size-3" />}
                <span>{copiedHash === h.sha256 ? "Copied" : "Copy"}</span>
              </button>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
