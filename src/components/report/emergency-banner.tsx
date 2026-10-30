"use client";
import { useQuery } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { Phone, Siren } from "lucide-react";
import type { EmergencyContact, PublicConfig } from "@/lib/domain";
import { pickLang } from "@/lib/lang";
import { cn, toLocaleDigits } from "@/lib/utils";
import { Skeleton } from "@/components/ui";
import { apiFetch } from "@/components/api-client";

export function usePublicConfig(enabled = true) {
  return useQuery({
    queryKey: ["meta", "config"],
    queryFn: () => apiFetch<PublicConfig>("/api/meta/config"),
    enabled,
    staleTime: 5 * 60_000,
  });
}

function ContactRow({ contact }: { contact: EmergencyContact }) {
  const t = useTranslations("emergency");
  const locale = useLocale();
  const label = pickLang(contact, "label", locale);
  const phone = contact.phone.trim();
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-surface px-3 py-2">
      <span className="text-sm font-medium">{label}</span>
      {phone ? (
        <a
          href={`tel:${phone.replace(/[^\d+]/g, "")}`}
          className="inline-flex h-9 items-center gap-2 rounded-full bg-danger px-4 text-sm font-semibold text-white shadow-sm hover:bg-danger/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Phone className="size-4" aria-hidden />
          {toLocaleDigits(phone, locale)}
        </a>
      ) : (
        <span className="text-xs text-muted-foreground">{t("notConfigured")}</span>
      )}
    </li>
  );
}

/**
 * Red urgent banner with the campus security/emergency contacts from /api/meta/config (PRD rule 5).
 * It never claims help has been dispatched.
 */
export function EmergencyBanner({ className, compact = false }: { className?: string; compact?: boolean }) {
  const t = useTranslations("emergency");
  const config = usePublicConfig();
  const contacts = [config.data?.campus_security, config.data?.campus_emergency].filter(
    (c): c is EmergencyContact => Boolean(c),
  );
  return (
    <section role="alert" className={cn("rounded-card border border-danger-border bg-danger-soft p-4", className)}>
      <div className="flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-danger text-white">
          <Siren className="size-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold">{t("title")}</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">{compact ? t("bodyShort") : t("body")}</p>
        </div>
      </div>
      <ul className="mt-3 space-y-2">
        {config.isPending ? (
          <li>
            <Skeleton className="h-11 w-full rounded-xl" />
          </li>
        ) : contacts.length > 0 ? (
          contacts.map((c) => <ContactRow key={c.label_en} contact={c} />)
        ) : (
          <li className="rounded-xl bg-surface px-3 py-2 text-sm text-muted-foreground">{t("none")}</li>
        )}
      </ul>
    </section>
  );
}
