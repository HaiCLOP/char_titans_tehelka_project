import { getTranslations } from "next-intl/server";
import { CampusMap, type MapIssue, type MapLocation } from "@/components/map/campus-map";
import { ErrorState } from "@/components/ui";
import { CATEGORIES, DONE_STATUSES, OPEN_STATUSES, type Category } from "@/lib/domain";
import { createClient } from "@/lib/supabase/server";

const ISSUE_COLUMNS = "id, code, title_en, title_as, category, priority, status, location_id, metoo_count, created_at, resolved_at";
const MAX_ROWS = 1000;
const FIXED_DAYS = 7;

async function loadMap(includeFixed: boolean) {
  const supabase = await createClient();
  const since = new Date(Date.now() - FIXED_DAYS * 864e5).toISOString();
  const [locs, open, fixed] = await Promise.all([
    supabase.from("locations").select("id, name_en, name_as, type, map_x, map_y").order("name_en"),
    supabase.from("complaints_public").select(ISSUE_COLUMNS).in("status", [...OPEN_STATUSES]).order("priority").order("created_at", { ascending: false }).limit(MAX_ROWS),
    includeFixed
      ? supabase.from("complaints_public").select(ISSUE_COLUMNS).in("status", [...DONE_STATUSES]).gte("resolved_at", since).order("resolved_at", { ascending: false }).limit(MAX_ROWS)
      : Promise.resolve({ data: [], error: null }),
  ]);
  return { locs, open, fixed };
}

/**
 * S11 — public campus map. Signed-out safe: only `complaints_public` (public, not sensitive, not merged)
 * and `locations`, both readable by anon. Filters live in the URL.
 */
export default async function MapPage({ searchParams }: { searchParams: Promise<{ category?: string | string[]; fixed?: string | string[] }> }) {
  const sp = await searchParams;
  const rawCat = typeof sp.category === "string" ? sp.category : undefined;
  const category = rawCat && (CATEGORIES as readonly string[]).includes(rawCat) ? (rawCat as Category) : null;
  const includeFixed = sp.fixed === "1";

  const [t, { locs, open, fixed }] = await Promise.all([getTranslations("map"), loadMap(includeFixed)]);

  const failed = locs.error || open.error || fixed.error;
  if (failed) console.error("[map] load failed", failed.code, failed.message);

  return (
    <div>
      <header className="max-w-2xl">
        <h1 className="text-display text-[2.25rem] sm:text-[3rem]">{t("title")}</h1>
        <p className="mt-3 text-[1.0625rem] leading-relaxed text-muted-foreground">{t("subtitle")}</p>
      </header>
      <div className="mt-8">
        {failed ? (
          <ErrorState title={t("loadErrorTitle")} body={t("loadErrorBody")} />
        ) : (
          <CampusMap
            locations={(locs.data ?? []) as MapLocation[]}
            issues={[...((open.data ?? []) as MapIssue[]), ...((fixed.data ?? []) as MapIssue[])]}
            category={category}
            includeFixed={includeFixed}
          />
        )}
      </div>
    </div>
  );
}
