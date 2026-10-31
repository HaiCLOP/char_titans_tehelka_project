import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Building2 } from "lucide-react";
import { CampusMap, type MapIssue, type MapLocation } from "@/components/map/campus-map";
import { AdminMapFilters, type AdminMapQuery, MAP_DAYS, STATUS_GROUPS } from "@/components/map/admin-map-filters";
import { EmptyState, ErrorState, LangText } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { CATEGORIES, DONE_STATUSES, OPEN_STATUSES, type Category } from "@/lib/domain";
import { createClient } from "@/lib/supabase/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("nav.admin");
  return { title: `${t("map")} — ${t("title")}` };
}

const COLUMNS =
  "id, code, title_en, title_as, category, priority, status, location_id, metoo_count, created_at, resolved_at, visibility, is_sensitive";
const MAX_ROWS = 1500;
const UUID = /^[0-9a-f-]{36}$/i;

type Dept = { id: string; name_en: string; name_as: string };
type SP = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);

function parseQuery(sp: SP, isSuper: boolean): AdminMapQuery {
  const cat = one(sp.category);
  const pr = Number(one(sp.priority));
  const st = one(sp.status);
  const days = Number(one(sp.days));
  const dept = one(sp.department);
  return {
    category: cat && (CATEGORIES as readonly string[]).includes(cat) ? (cat as Category) : null,
    priority: [1, 2, 3, 4].includes(pr) ? pr : null,
    status: st && (STATUS_GROUPS as readonly string[]).includes(st) ? (st as AdminMapQuery["status"]) : "open",
    days: (MAP_DAYS as readonly number[]).includes(days) ? days : 30,
    department: isSuper && dept && UUID.test(dept) ? dept : null,
  };
}

async function loadAdminMap(supabase: Awaited<ReturnType<typeof createClient>>, q: AdminMapQuery, dept: string | null) {
  const since = new Date(Date.now() - q.days * 864e5).toISOString();
  const statuses = q.status === "open" ? [...OPEN_STATUSES] : q.status === "fixed" ? [...DONE_STATUSES] : [...OPEN_STATUSES, ...DONE_STATUSES];

  let issuesQ = supabase
    .from("complaints")
    .select(COLUMNS)
    .is("parent_id", null)
    .in("status", statuses)
    // Activity in the window: reported in it, or fixed in it.
    .or(`created_at.gte.${since},resolved_at.gte.${since}`)
    .order("priority")
    .order("created_at", { ascending: false })
    .limit(MAX_ROWS);
  if (dept) issuesQ = issuesQ.eq("department_id", dept);
  if (q.category) issuesQ = issuesQ.eq("category", q.category);
  if (q.priority) issuesQ = issuesQ.eq("priority", q.priority);

  const [locs, issues, depts] = await Promise.all([
    supabase.from("locations").select("id, name_en, name_as, type, map_x, map_y").order("name_en"),
    issuesQ,
    supabase.from("departments").select("id, name_en, name_as").order("name_en"),
  ]);
  return { locs, issues, depts };
}

/**
 * S17 — admin campus map. Reads the base `complaints` table with the admin's RLS client (never the public view),
 * so private and sensitive tickets of the admin's scope are included: dept_admin = own department,
 * super_admin = all departments or `?department=`. Filters live in the URL.
 */
export default async function AdminMapPage({ searchParams }: { searchParams: Promise<SP> }) {
  const { profile } = await requireRole("dept_admin", "super_admin");
  const isSuper = profile.role === "super_admin";
  const [sp, t, tm, supabase] = await Promise.all([
    searchParams,
    getTranslations("adminMap"),
    getTranslations("map"),
    createClient(),
  ]);
  if (!isSuper && !profile.department_id) {
    const ta = await getTranslations("admin");
    return <EmptyState className="mt-6" icon={Building2} title={ta("noDeptTitle")} body={ta("noDeptBody")} />;
  }

  const q = parseQuery(sp, isSuper);
  const dept = isSuper ? q.department : profile.department_id;
  const { locs, issues, depts } = await loadAdminMap(supabase, q, dept);
  const failed = locs.error || issues.error || depts.error;
  if (failed) console.error("[admin-map] load failed", failed.code, failed.message);

  const departments = (depts.data ?? []) as Dept[];
  const scope = departments.find((d) => d.id === dept) ?? null;

  return (
    <div className="mx-auto max-w-[84rem]">
      <header className="max-w-2xl">
        <h1 className="text-display text-[2.25rem] sm:text-[2.75rem]">{t("title")}</h1>
        <p className="mt-2 text-muted-foreground">
          {scope ? <LangText en={scope.name_en} as={scope.name_as} /> : t("allDepartments")}
          {" · "}
          {t("subtitle")}
        </p>
      </header>
      <div className="mt-6">
        {failed ? (
          <ErrorState title={tm("loadErrorTitle")} body={tm("loadErrorBody")} />
        ) : (
          <CampusMap
            locations={(locs.data ?? []) as MapLocation[]}
            issues={(issues.data ?? []) as MapIssue[]}
            category={null}
            includeFixed={q.status !== "open"}
            filters={<AdminMapFilters query={q} departments={isSuper ? departments : []} />}
            issueHrefBase="/admin/t/"
            sizeBy={q.status === "fixed" ? "all" : "open"}
            reportCta={false}
            labels={{
              legendSize: q.status === "fixed" ? t("legendSizeFixed") : t("legendSizeOpen"),
              emptyTitle: t("emptyTitle"),
              emptyBody: t("emptyBody"),
              drawerEmptyBody: t("drawerEmptyBody"),
              private: t("private"),
              sensitive: t("sensitive"),
            }}
          />
        )}
      </div>
    </div>
  );
}
