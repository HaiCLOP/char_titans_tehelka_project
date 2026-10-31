import { getTranslations } from "next-intl/server";
import { CampusMap, type MapIssue, type MapLocation } from "@/components/map/campus-map";
import { ErrorState } from "@/components/ui";
import { CATEGORIES, DONE_STATUSES, OPEN_STATUSES, type Category } from "@/lib/domain";
import { createClient } from "@/lib/supabase/server";

const ISSUE_COLUMNS = "id, code, title_en, title_as, category, priority, status, location_id, metoo_count, created_at, resolved_at";
const MAX_ROWS = 1000;
const FIXED_DAYS = 7;

// ponytail: cache static campus map locations in memory (5m TTL)
let cachedMapLocations: { data: MapLocation[]; expiresAt: number } | null = null;
const MAP_LOC_CACHE_TTL = 5 * 60 * 1000;

async function getMapLocations(supabase: Awaited<ReturnType<typeof createClient>>): Promise<{ data: MapLocation[]; error: { code: string; message: string } | null }> {
  const now = Date.now();
  if (cachedMapLocations && cachedMapLocations.expiresAt > now) {
    return { data: cachedMapLocations.data, error: null };
  }
  const res = await supabase.from("locations").select("id, name_en, name_as, type, map_x, map_y").order("name_en");
  if (!res.error && res.data) {
    cachedMapLocations = { data: res.data as MapLocation[], expiresAt: now + MAP_LOC_CACHE_TTL };
  }
  return res as { data: MapLocation[]; error: { code: string; message: string } | null };
}

async function loadMap(includeFixed: boolean) {
  const supabase = await createClient();
  const since = new Date(Date.now() - FIXED_DAYS * 864e5).toISOString();
  const [locs, open, fixed] = await Promise.all([
    getMapLocations(supabase),
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
