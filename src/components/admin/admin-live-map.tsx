"use client";

import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { CampusAtlas, type AtlasMarker } from "@/components/map/campus-atlas";
import { LangText, PriorityChip } from "@/components/ui";
import type { OpsLocation, OpsTicket } from "./ops";

export function AdminLiveMap({ markers, locations, tickets, label }: { markers: AtlasMarker[]; locations: OpsLocation[]; tickets: OpsTicket[]; label: string }) {
  const t = useTranslations("admin.ops");
  const [selected, setSelected] = useState<string | null>(null);
  const location = locations.find((item) => item.id === selected);
  const issues = tickets.filter((item) => item.location_id === selected);
  return <div>
    <p className="mb-3 text-xs text-muted-foreground">{t("mapInteraction")}</p>
    <CampusAtlas markers={markers} label={label} selectedId={selected} onSelect={setSelected} className="h-[320px] w-full rounded-2xl sm:h-[420px]" />
    {location && <div className="mt-3 rounded-xl border border-border p-4" aria-live="polite">
      <LangText en={location.name_en} as={location.name_as} className="font-semibold" />
      {issues.length ? <ul className="mt-2 divide-y divide-border">{issues.map((issue) => <li key={issue.id}><Link href={`/admin/t/${issue.id}`} className="flex min-h-11 items-center justify-between gap-3 py-2 text-sm hover:underline"><LangText en={issue.title_en} as={issue.title_as} fallback={issue.code} /><PriorityChip priority={issue.priority} /></Link></li>)}</ul> : <p className="mt-2 text-sm text-muted-foreground">{t("mapNoIssues")}</p>}
    </div>}
  </div>;
}
