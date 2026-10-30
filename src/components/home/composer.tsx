"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { ArrowRight, ImagePlus, PenLine } from "lucide-react";
import { Avatar, Button } from "@/components/ui";

/** Key /report reads to prefill the description (kept out of the URL so complaint text never lands in logs). */
export const REPORT_DRAFT_KEY = "cs_report_draft";

/** "What needs fixing?" — starts a report from the home page without leaving the flow. */
export function HomeComposer({ name }: { name: string | null }) {
  const t = useTranslations("home");
  const router = useRouter();
  const [text, setText] = useState("");

  const go = () => {
    try {
      if (text.trim()) sessionStorage.setItem(REPORT_DRAFT_KEY, text.trim());
    } catch {
      /* private mode: the report page simply starts empty */
    }
    router.push("/report");
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        go();
      }}
      className="rounded-card border border-border bg-surface p-5 shadow-sm sm:p-6"
    >
      <div className="flex items-start gap-3">
        {name ? (
          <Avatar name={name} size="md" decorative />
        ) : (
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-surface-muted text-muted-foreground" aria-hidden>
            <PenLine className="size-[18px]" strokeWidth={1.75} />
          </span>
        )}
        <div className="min-w-0">
          <h2 className="text-title text-[1.0625rem]">{t("composeTitle")}</h2>
          <p className="text-sm text-muted-foreground">{t("composeHint")}</p>
        </div>
      </div>
      <label className="sr-only" htmlFor="home-compose">{t("composeTitle")}</label>
      <textarea
        id="home-compose"
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={3}
        maxLength={2000}
        placeholder={t("composePlaceholder")}
        className="mt-4 block w-full resize-none rounded-field border border-border bg-surface px-4 py-3 text-[0.9375rem] leading-relaxed outline-none transition-colors focus:border-border-strong focus:bg-surface"
      />
      <div className="mt-4 flex items-center justify-between gap-3">
        <Button type="button" variant="ghost" size="sm" onClick={go} className="-ml-2">
          <ImagePlus aria-hidden /> {t("addPhoto")}
        </Button>
        <Button type="submit" variant="primary">
          {t("continue")} <ArrowRight aria-hidden />
        </Button>
      </div>
    </form>
  );
}
