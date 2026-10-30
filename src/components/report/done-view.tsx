"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { motion, useReducedMotion } from "framer-motion";
import { toast } from "sonner";
import { Building2, CheckCircle2, ClipboardList, Clock, Copy, Plus, Share2 } from "lucide-react";
import type { NamedRef, Status } from "@/lib/domain";
import { toLocaleDigits } from "@/lib/utils";
import { Button, Card, LangText, StatusChip, buttonVariants, formatAbsolute } from "@/components/ui";
import { EmergencyBanner } from "./emergency-banner";

type DoneViewProps = {
  id: string;
  code: string;
  department: NamedRef | null;
  slaDueAt: string | null;
  status: Status;
  isUrgent: boolean;
};

export function DoneView({ id, code, department, slaDueAt, status, isUrgent }: DoneViewProps) {
  const t = useTranslations("done");
  const locale = useLocale();
  const reduce = useReducedMotion();
  const [canShare, setCanShare] = useState(false);
  useEffect(() => {
    // navigator.share only exists in the browser; decide after mount to keep hydration stable.
    const id = setTimeout(() => setCanShare(typeof navigator !== "undefined" && typeof navigator.share === "function"), 0);
    return () => clearTimeout(id);
  }, []);

  const share = async () => {
    const url = `${window.location.origin}/c/${id}`;
    if (canShare) {
      try {
        await navigator.share({ title: code, text: t("shareText", { code }), url });
        return;
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") return;
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      toast.success(t("copied"));
    } catch {
      toast.error(t("copyFailed"));
    }
  };

  return (
    <div className="mx-auto max-w-xl space-y-5 py-4">
      <Card className="text-center sm:p-8">
        <motion.span
          initial={reduce ? false : { scale: 0.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 260, damping: 18 }}
          className="mx-auto grid size-20 place-items-center rounded-full bg-p4/15 text-p4"
        >
          <CheckCircle2 className="size-11" aria-hidden />
        </motion.span>
        <h1 className="mt-4 text-2xl font-bold tracking-tight">{t("title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>

        <div className="mt-5 inline-flex flex-wrap items-center justify-center gap-2 rounded-full bg-surface-muted px-4 py-2">
          <span className="text-xs text-muted-foreground">{t("code")}</span>
          <span className="font-mono text-lg font-semibold tracking-wider">{code}</span>
        </div>

        <dl className="mt-6 space-y-3 text-left text-sm">
          <div className="flex items-start gap-3 rounded-xl border border-border p-3">
            <Building2 className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
            <div className="min-w-0">
              <dt className="text-xs text-muted-foreground">{t("department")}</dt>
              <dd className="font-medium">
                {department ? <LangText en={department.name_en} as={department.name_as} /> : t("departmentPending")}
              </dd>
            </div>
          </div>
          <div className="flex items-start gap-3 rounded-xl border border-border p-3">
            <Clock className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
            <div className="min-w-0">
              <dt className="text-xs text-muted-foreground">{t("sla")}</dt>
              <dd className="font-medium" suppressHydrationWarning>
                {slaDueAt ? t("slaBy", { date: toLocaleDigits(formatAbsolute(slaDueAt, locale), locale) }) : t("slaPending")}
              </dd>
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-xl border border-border p-3">
            <span className="text-xs text-muted-foreground">{t("status")}</span>
            <StatusChip status={status} />
          </div>
        </dl>
      </Card>

      {isUrgent && <EmergencyBanner compact />}

      <div className="grid gap-2 sm:grid-cols-3">
        <Link href={`/c/${id}`} className={buttonVariants({ size: "lg", block: true })}>
          <ClipboardList aria-hidden />
          {t("track")}
        </Link>
        <Link href="/report" className={buttonVariants({ variant: "secondary", size: "lg", block: true })}>
          <Plus aria-hidden />
          {t("another")}
        </Link>
        <Button variant="secondary" size="lg" block onClick={share}>
          {canShare ? <Share2 aria-hidden /> : <Copy aria-hidden />}
          {canShare ? t("share") : t("copyLink")}
        </Button>
      </div>
    </div>
  );
}
