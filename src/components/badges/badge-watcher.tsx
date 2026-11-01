"use client";
import { useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import type { MyBadges } from "@/lib/domain";
import { BADGE_ICON } from "./badge-icon";
import { Celebration } from "./celebration";
import { useNewBadges } from "./use-badges";

/** Celebrates badges earned since this viewer last looked (dialog with Civi + toast). Renders nothing otherwise. */
export function BadgeWatcher({ userId, data }: { userId: string; data: MyBadges | undefined }) {
  const t = useTranslations("badges");
  const { fresh, clear } = useNewBadges(userId, data);
  const toasted = useRef<string>("");

  useEffect(() => {
    const sig = fresh.join(",");
    if (!sig || toasted.current === sig) return;
    toasted.current = sig;
    for (const id of fresh) toast.success(t("celebrate.toast", { name: t(`items.${id}.name`) }));
  }, [fresh, t]);

  if (fresh.length === 0) return null;
  return (
    <Celebration
      open
      onOpenChange={(o) => !o && clear()}
      title={t("celebrate.title", { count: fresh.length })}
      body={t("celebrate.body")}
    >
      <ul className="mt-4 flex flex-wrap justify-center gap-2">
        {fresh.map((id) => {
          const Icon = BADGE_ICON[id];
          return (
            <li key={id} className="inline-flex items-center gap-2 rounded-full border border-border bg-surface-muted px-3 py-1.5 text-sm font-medium">
              <Icon className="size-4" strokeWidth={1.75} aria-hidden />
              {t(`items.${id}.name`)}
            </li>
          );
        })}
      </ul>
    </Celebration>
  );
}
