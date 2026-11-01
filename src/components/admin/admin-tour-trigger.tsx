"use client";

import { useLocale } from "next-intl";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui";

export function AdminTourTrigger() {
  const locale = useLocale();
  const launch = () => {
    window.dispatchEvent(new CustomEvent("civicsense:open-admin-tour"));
  };

  return (
    <Button
      variant="secondary"
      size="sm"
      onClick={launch}
      className="gap-1.5 rounded-full text-xs font-semibold h-10 px-4 border border-border shadow-xs hover:border-primary/40 transition-colors"
      title={locale === "as" ? "পৰিচালনা ভ্ৰমণ" : "Ops Walkthrough"}
    >
      <Sparkles className="size-3.5 text-primary" />
      <span>{locale === "as" ? "চিভি গাইড" : "Civi Tour"}</span>
    </Button>
  );
}

