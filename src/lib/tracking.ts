import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  ADMIN_ROLES,
  ComplaintDetailSchema,
  ComplaintListPageSchema,
  LIST_PAGE_SIZE,
  OPEN_STATUSES,
  REOPEN_WINDOW_DAYS,
  type ComplaintDetail,
  type ComplaintListItem,
  type ComplaintListPage,
  type ComplaintListQuery,
  type EventActor,
  type NamedRef,
  type Profile,
  type Role,
  type Status,
  type TimelineEvent,
  type VerifyRequest,
  type VerifyResult,
} from "@/lib/domain";
import { PipelineError } from "@/lib/complaints";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAssameseText } from "@/lib/utils";

/**
 * Read side of the ticket lifecycle (M4): lists, detail, reporter verification.
 *
 * Privacy model
 * - Every row is read with the caller's RLS client; scopes add explicit filters on top because RLS is a
 *   union (e.g. any signed-in user can read every public ticket, so "mine" must still filter user_id).
 * - user_id / assignee_id / embedding / ai_meta are read server-side only and never returned, except
 *   reporter name + AI summary for admins of the ticket's department (never for anonymous reports).
 * - Photos are private. Storage RLS only lets the uploader or an admin read them, so for other legitimate
 *   viewers (public-ticket viewers, the assignee, a reporter looking at the staff's after-photo) the URL
 *   is signed with the service role — only for rows the caller's RLS client already returned.
 */

const PHOTO_BUCKET = "complaint-photos";
const RESOLUTION_BUCKET = "resolution-photos";
const SIGNED_URL_TTL = 60 * 60;

type Client = SupabaseClient;
export type Viewer = { id: string; profile: Profile } | null;

const isAdminRole = (r: Role) => (ADMIN_ROLES as readonly Role[]).includes(r);

// ---------- helpers ----------

/** Cursor = base64url JSON [created_at, id] of the last item. */
function encodeCursor(createdAt: string, id: string) {
  return Buffer.from(JSON.stringify([createdAt, id])).toString("base64url");
}
function decodeCursor(c: string): [string, string] | null {
  try {
    const v: unknown = JSON.parse(Buffer.from(c, "base64url").toString("utf8"));
    if (
      Array.isArray(v) && v.length === 2 &&
      typeof v[0] === "string" && !Number.isNaN(Date.parse(v[0])) &&
      typeof v[1] === "string" && /^[0-9a-f-]{36}$/i.test(v[1])
    ) {
      return [v[0], v[1]];
    }
  } catch {
    /* fall through */
  }
  return null;
}

/** Makes user text safe inside a PostgREST `or=(…ilike…)` filter and folds Bengali র → Assamese ৰ. */
export function sanitizeSearch(q: string): string {
  return q.replace(/[%_,()*\\":]/g, " ").replace(/র/g, "ৰ").replace(/\s+/g, " ").trim().slice(0, 60);
}

/**
 * Signs storage paths. Paths the caller can read under storage RLS (own folder, or any path for admins)
 * use the caller's client; the rest use the service role (see the privacy note above).
 */
async function signPaths(supabase: Client, viewer: NonNullable<Viewer>, bucket: string, paths: string[]) {
  const out = new Map<string, string>();
  const unique = [...new Set(paths.filter(Boolean))];
  if (unique.length === 0) return out;
  const canSelf = (p: string) => isAdminRole(viewer.profile.role) || p.startsWith(`${viewer.id}/`);
  const self = unique.filter(canSelf);
  const other = unique.filter((p) => !canSelf(p));
  const sign = async (client: Client, list: string[]) => {
    if (list.length === 0) return;
    const { data, error } = await client.storage.from(bucket).createSignedUrls(list, SIGNED_URL_TTL);
    if (error) {
      console.warn("[tracking] sign urls failed", bucket, error.message);
      return;
    }
    for (const d of data ?? []) if (d.path && d.signedUrl && !d.error) out.set(d.path, d.signedUrl);
  };
  await Promise.all([sign(supabase, self), other.length ? sign(createAdminClient(), other) : Promise.resolve()]);
  return out;
}

async function loadLocations(supabase: Client, ids: (string | null)[]) {
  const map = new Map<string, NamedRef>();
  const unique = [...new Set(ids.filter((x): x is string => Boolean(x)))];
  if (unique.length === 0) return map;
  const { data } = await supabase.from("locations").select("id, name_en, name_as").in("id", unique);
  for (const l of (data ?? []) as NamedRef[]) map.set(l.id, l);
  return map;
}

const LIST_COLUMNS =
  "id, code, title_en, title_as, summary_en, summary_as, category, priority, status, original_lang, location_id, " +
  "metoo_count, created_at, updated_at, sla_due_at, is_urgent, visibility, image_urls";

type ListRow = {
  id: string;
  code: string;
  title_en: string | null;
  title_as: string | null;
  summary_en: string | null;
  summary_as: string | null;
  category: ComplaintListItem["category"];
  priority: number;
  status: Status;
  original_lang?: "en" | "as" | null;
  location_id: string | null;
  metoo_count: number;
  created_at: string;
  updated_at?: string;
  resolved_at?: string | null;
  sla_due_at?: string | null;
  is_urgent?: boolean;
  visibility?: "public" | "private";
  image_urls?: string[];
  anonymous?: boolean;
  reporter_id?: string | null;
};

// ---------- GET /api/complaints ----------

/**
 * Keyset-paginated list (created_at desc, id desc), 20 per page.
 * Scope permissions are checked by the route; this applies the scope filters.
 */
export async function listComplaints(supabase: Client, viewer: Viewer, q: ComplaintListQuery): Promise<ComplaintListPage> {
  const signedOutPublic = q.scope === "public" && !viewer;
  const table = signedOutPublic ? "complaints_public" : q.scope === "dept" ? "complaints_admin" : "complaints";
  const columns = signedOutPublic
    ? "id, code, title_en, title_as, summary_en, summary_as, category, priority, status, location_id, metoo_count, created_at, resolved_at"
    : q.scope === "dept"
      ? `${LIST_COLUMNS}, anonymous, reporter_id`
      : LIST_COLUMNS;

  let query = supabase.from(table).select(columns);

  switch (q.scope) {
    case "mine":
      query = query.eq("user_id", viewer!.id);
      break;
    case "assigned":
      query = query.eq("assignee_id", viewer!.id);
      break;
    case "public":
      // The view already filters; the base table needs the same filter because RLS also returns the
      // viewer's own private tickets and (for admins) their department's.
      if (viewer) query = query.eq("visibility", "public").eq("is_sensitive", false).is("parent_id", null);
      break;
    case "dept": {
      const role = viewer!.profile.role;
      if (role === "dept_admin") {
        if (!viewer!.profile.department_id) return { items: [], nextCursor: null };
        query = query.eq("department_id", viewer!.profile.department_id);
      } else if (q.department) {
        query = query.eq("department_id", q.department);
      }
      break;
    }
  }

  if (q.status.length) query = query.in("status", q.status);
  if (q.priority.length) query = query.in("priority", q.priority);
  if (q.category.length) query = query.in("category", q.category);
  if (q.location) query = query.eq("location_id", q.location);
  if (q.lang && !signedOutPublic) query = query.eq("original_lang", q.lang);
  const term = q.q ? sanitizeSearch(q.q) : "";
  if (term) query = query.or(`title_en.ilike.%${term}%,title_as.ilike.%${term}%,code.ilike.%${term}%`);
  if (q.cursor) {
    const c = decodeCursor(q.cursor);
    if (!c) throw new PipelineError("VALIDATION_ERROR", "Invalid cursor");
    const [ts, id] = c;
    query = query.or(`created_at.lt."${ts}",and(created_at.eq."${ts}",id.lt.${id})`);
  }

  const { data, error } = await query
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(LIST_PAGE_SIZE + 1);
  if (error) {
    console.error("[tracking] list failed", q.scope, error.code, error.message);
    throw new PipelineError("INTERNAL", "Could not load complaints");
  }

  const rows = (data ?? []) as unknown as ListRow[];
  const page = rows.slice(0, LIST_PAGE_SIZE);
  const nextCursor = rows.length > LIST_PAGE_SIZE ? encodeCursor(page.at(-1)!.created_at, page.at(-1)!.id) : null;

  const reporterIds = q.scope === "dept" ? page.map((r) => r.reporter_id).filter((x): x is string => Boolean(x)) : [];
  const [locations, thumbs, supported, reporters] = await Promise.all([
    loadLocations(supabase, page.map((r) => r.location_id)),
    viewer
      ? signPaths(supabase, viewer, PHOTO_BUCKET, page.map((r) => r.image_urls?.[0] ?? ""))
      : Promise.resolve(new Map<string, string>()),
    viewer && q.scope === "public" && page.length
      ? supabase
          .from("complaint_supporters")
          .select("complaint_id")
          .eq("user_id", viewer.id)
          .in("complaint_id", page.map((r) => r.id))
          .then(({ data: s }) => new Set((s ?? []).map((x: { complaint_id: string }) => x.complaint_id)))
      : Promise.resolve(new Set<string>()),
    reporterIds.length
      ? supabase
          .from("profiles")
          .select("id, full_name")
          .in("id", [...new Set(reporterIds)])
          .then(({ data: p }) => new Map((p ?? []).map((x: { id: string; full_name: string | null }) => [x.id, x.full_name])))
      : Promise.resolve(new Map<string, string | null>()),
  ]);

  const items: ComplaintListItem[] = page.map((r) => {
    const first = r.image_urls?.[0];
    const item: ComplaintListItem = {
      id: r.id,
      code: r.code,
      title_en: r.title_en,
      title_as: r.title_as,
      summary_en: r.summary_en,
      summary_as: r.summary_as,
      category: r.category,
      priority: r.priority,
      status: r.status,
      original_lang: r.original_lang ?? null,
      location: r.location_id ? (locations.get(r.location_id) ?? null) : null,
      metoo_count: r.metoo_count,
      created_at: r.created_at,
      updated_at: r.updated_at ?? r.resolved_at ?? r.created_at,
      sla_due_at: r.sla_due_at ?? null,
      is_urgent: r.is_urgent ?? false,
      visibility: r.visibility ?? "public",
      thumb: first ? (thumbs.get(first) ?? null) : null,
    };
    if (viewer && q.scope === "public") item.supported_by_me = supported.has(r.id);
    if (q.scope === "dept") {
      item.anonymous = Boolean(r.anonymous);
      item.reporter_name = r.reporter_id ? (reporters.get(r.reporter_id) ?? null) : null;
    }
    return item;
  });

  return ComplaintListPageSchema.parse({ items, nextCursor });
}

// ---------- GET /api/complaints/[id] ----------

const DETAIL_COLUMNS =
  `${LIST_COLUMNS}, user_id, anonymous, original_text, location_note, department_id, assignee_id, parent_id, ` +
  "is_sensitive, ai_status, ai_meta, resolution_note_en, resolution_note_as, resolution_photo_url, rating, " +
  "verified_by_reporter, resolved_at, department:departments(id, name_en, name_as)";

type DetailRow = ListRow & {
  user_id: string | null;
  anonymous: boolean;
  original_text: string;
  location_note: string | null;
  department_id: string | null;
  assignee_id: string | null;
  parent_id: string | null;
  is_sensitive: boolean;
  ai_status: string;
  ai_meta: Record<string, unknown> | null;
  resolution_note_en: string | null;
  resolution_note_as: string | null;
  resolution_photo_url: string | null;
  rating: number | null;
  verified_by_reporter: boolean | null;
  resolved_at: string | null;
  department: NamedRef | null;
};

type EventRow = {
  id: number;
  type: string;
  from_status: Status | null;
  to_status: Status | null;
  note_en: string | null;
  note_as: string | null;
  created_at: string;
  actor_id: string | null;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CODE = /^CS-[0-9A-F]{6}$/i;

/** Accepts a uuid or a ticket code (CS-XXXXXX). Returns null for anything else. */
export function idFilter(idOrCode: string): { col: "id" | "code"; value: string } | null {
  if (UUID.test(idOrCode)) return { col: "id", value: idOrCode.toLowerCase() };
  if (CODE.test(idOrCode)) return { col: "code", value: idOrCode.toUpperCase() };
  return null;
}

const withinReopenWindow = (closedAt: string) =>
  Date.now() - Date.parse(closedAt) <= REOPEN_WINDOW_DAYS * 24 * 60 * 60 * 1000;

/** Last time the ticket entered `closed` (falls back to updated_at when no event exists). */
function closedAt(row: { updated_at?: string; created_at: string }, events: { to_status: Status | null; created_at: string }[]) {
  const last = [...events].reverse().find((e) => e.to_status === "closed");
  return last?.created_at ?? row.updated_at ?? row.created_at;
}

/** Ticket detail for a signed-in viewer, or null when RLS hides it (→ 404, PRD NEG2). */
export async function getComplaintDetail(
  supabase: Client,
  viewer: NonNullable<Viewer>,
  idOrCode: string,
): Promise<ComplaintDetail | null> {
  const f = idFilter(idOrCode);
  if (!f) return null;
  const { data, error } = await supabase.from("complaints").select(DETAIL_COLUMNS).eq(f.col, f.value).maybeSingle();
  if (error) {
    console.error("[tracking] detail failed", error.code, error.message);
    throw new PipelineError("INTERNAL", "Could not load the complaint");
  }
  if (!data) return null;
  const row = data as unknown as DetailRow;

  const { profile } = viewer;
  const isOwner = row.user_id === viewer.id;
  const isDeptAdmin =
    profile.role === "super_admin" ||
    (profile.role === "dept_admin" && !!profile.department_id && row.department_id === profile.department_id);
  const isAssignee = row.assignee_id === viewer.id;
  const staffView = isDeptAdmin || isAssignee;
  const isPublic = row.visibility === "public" && !row.is_sensitive && !row.parent_id;

  const [eventsRes, supportedRes, transitionsRes, photos, resolutionPhotos, location] = await Promise.all([
    supabase
      .from("complaint_events")
      .select("id, type, from_status, to_status, note_en, note_as, created_at, actor_id")
      .eq("complaint_id", row.id)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true }),
    supabase
      .from("complaint_supporters")
      .select("complaint_id")
      .eq("complaint_id", row.id)
      .eq("user_id", viewer.id)
      .maybeSingle(),
    supabase.from("status_transitions").select("to_status").eq("from_status", row.status),
    signPaths(supabase, viewer, PHOTO_BUCKET, row.image_urls ?? []),
    row.resolution_photo_url && !/^https?:/i.test(row.resolution_photo_url)
      ? signPaths(supabase, viewer, RESOLUTION_BUCKET, [row.resolution_photo_url])
      : Promise.resolve(new Map<string, string>()),
    loadLocations(supabase, [row.location_id]),
  ]);
  if (eventsRes.error) throw new PipelineError("INTERNAL", "Could not load the timeline");
  const eventRows = (eventsRes.data ?? []) as EventRow[];

  // Actor names: admins of this ticket only, never the reporter of an anonymous ticket.
  let names = new Map<string, string | null>();
  if (isDeptAdmin) {
    const ids = [...new Set([...eventRows.map((e) => e.actor_id), row.user_id].filter((x): x is string => Boolean(x)))];
    if (ids.length) {
      const { data: p } = await supabase.from("profiles").select("id, full_name").in("id", ids);
      names = new Map((p ?? []).map((x: { id: string; full_name: string | null }) => [x.id, x.full_name]));
    }
  }
  const hideName = (id: string | null) => !id || (row.anonymous && id === row.user_id);

  const events: TimelineEvent[] = eventRows.map((e) => {
    let actor: EventActor;
    if (!e.actor_id) actor = "system";
    else if (e.actor_id === viewer.id) actor = "me";
    else if (e.actor_id === row.user_id) actor = "reporter";
    else if (e.type === "metoo") actor = "supporter";
    else actor = "staff";
    const ev: TimelineEvent = {
      id: e.id,
      type: e.type,
      from_status: e.from_status,
      to_status: e.to_status,
      note_en: e.note_en,
      note_as: e.note_as,
      created_at: e.created_at,
      actor,
    };
    if (isDeptAdmin) ev.actor_name = hideName(e.actor_id) ? null : (names.get(e.actor_id!) ?? null);
    return ev;
  });

  const supported = Boolean(supportedRes.data);
  const canReopen = isOwner && row.status === "closed" && withinReopenWindow(closedAt(row, eventRows));
  const canVerify = isOwner && row.status === "resolved";

  // allowed_next: same table the DB trigger enforces, narrowed to what this viewer may do (PRD 8.2).
  const table = ((transitionsRes.data ?? []) as { to_status: Status }[]).map((t) => t.to_status);
  const allowed = new Set<Status>();
  for (const to of table) {
    if (isDeptAdmin) allowed.add(to);
    if (isAssignee && (to === "in_progress" || to === "resolved")) allowed.add(to);
    if (isOwner && row.status === "resolved" && (to === "closed" || to === "in_progress")) allowed.add(to);
    if (canReopen && to === "in_progress") allowed.add(to);
  }

  const first = row.image_urls?.[0];
  const meta = row.ai_meta ?? {};
  const num = (v: unknown) => (typeof v === "number" ? v : null);
  const str = (v: unknown) => (typeof v === "string" ? v : null);
  const hasResolution = row.resolution_note_en || row.resolution_note_as || row.resolution_photo_url;

  const detail: ComplaintDetail = {
    id: row.id,
    code: row.code,
    title_en: row.title_en,
    title_as: row.title_as,
    summary_en: row.summary_en,
    summary_as: row.summary_as,
    category: row.category,
    priority: row.priority,
    status: row.status,
    original_lang: row.original_lang ?? null,
    location: row.location_id ? (location.get(row.location_id) ?? null) : null,
    metoo_count: row.metoo_count,
    created_at: row.created_at,
    updated_at: row.updated_at ?? row.created_at,
    sla_due_at: row.sla_due_at ?? null,
    is_urgent: row.is_urgent ?? false,
    visibility: row.visibility ?? "private",
    thumb: first ? (photos.get(first) ?? null) : null,
    original_text: isOwner || staffView ? row.original_text : null,
    location_note: row.location_note,
    photos: (row.image_urls ?? []).map((p) => photos.get(p)).filter((u): u is string => Boolean(u)),
    resolved_at: row.resolved_at,
    resolution: hasResolution
      ? {
          note_en: row.resolution_note_en,
          note_as: row.resolution_note_as,
          photo_url: row.resolution_photo_url
            ? /^https?:/i.test(row.resolution_photo_url)
              ? row.resolution_photo_url
              : (resolutionPhotos.get(row.resolution_photo_url) ?? null)
            : null,
        }
      : null,
    rating: row.rating,
    verified_by_reporter: row.verified_by_reporter,
    department: row.department ?? null,
    is_owner: isOwner,
    is_staff_view: staffView,
    supported_by_me: supported,
    can_support: isPublic && !isOwner && !supported && (OPEN_STATUSES as readonly Status[]).includes(row.status),
    can_verify: canVerify,
    can_reopen: canReopen,
    events,
    allowed_next: [...allowed],
  };
  if (staffView) {
    detail.reporter = {
      name: isDeptAdmin && !hideName(row.user_id) ? (names.get(row.user_id!) ?? null) : null,
      anonymous: row.anonymous,
    };
  }
  if (isDeptAdmin) {
    detail.ai = {
      status: row.ai_status,
      model: str(meta.model),
      confidence: num(meta.confidence),
      priority_reason_en: str(meta.priority_reason_en),
      auto_routed: typeof meta.auto_routed === "boolean" ? meta.auto_routed : null,
    };
  }
  return ComplaintDetailSchema.parse(detail);
}

// ---------- POST /api/complaints/[id]/support ----------

export async function supportComplaint(supabase: Client, viewer: NonNullable<Viewer>, idOrCode: string) {
  const f = idFilter(idOrCode);
  if (!f) throw new PipelineError("NOT_FOUND", "Complaint not found");
  const { data: row } = await supabase.from("complaints").select("id, user_id").eq(f.col, f.value).maybeSingle();
  if (!row) throw new PipelineError("NOT_FOUND", "Complaint not found");
  if (row.user_id === viewer.id) throw new PipelineError("VALIDATION_ERROR", "You cannot support your own report");
  const { data, error } = await supabase.rpc("support_complaint", { cid: row.id });
  if (error) {
    if (error.code === "P0002") throw new PipelineError("NOT_FOUND", "Complaint not found");
    console.error("[tracking] support failed", error.code, error.message);
    throw new PipelineError("INTERNAL", "Could not add your support");
  }
  return { metoo_count: Number(data ?? 0) };
}

// ---------- POST /api/complaints/[id]/verify ----------

/**
 * Reporter confirms the fix (→ closed + rating), says it is not fixed (→ in_progress + reason note),
 * or reopens a closed ticket within 7 days. The status update runs with the reporter's RLS client so the
 * DB transition trigger applies; only the reason note is written with the service role, because
 * complaint_events has no insert policy (by design: events come from triggers/server code).
 */
export async function verifyComplaint(
  supabase: Client,
  viewer: NonNullable<Viewer>,
  idOrCode: string,
  body: VerifyRequest,
): Promise<VerifyResult> {
  const f = idFilter(idOrCode);
  if (!f) throw new PipelineError("NOT_FOUND", "Complaint not found");
  const { data, error } = await supabase
    .from("complaints")
    .select("id, user_id, status, created_at, updated_at")
    .eq(f.col, f.value)
    .maybeSingle();
  if (error) throw new PipelineError("INTERNAL", "Could not load the complaint");
  if (!data) throw new PipelineError("NOT_FOUND", "Complaint not found");
  const row = data as { id: string; user_id: string | null; status: Status; created_at: string; updated_at: string };
  if (row.user_id !== viewer.id) throw new PipelineError("FORBIDDEN", "Only the reporter can confirm this");

  let patch: Record<string, unknown>;
  if (row.status === "resolved" && body.fixed) {
    patch = { status: "closed", verified_by_reporter: true, ...(body.rating ? { rating: body.rating } : {}) };
  } else if (row.status === "resolved") {
    patch = { status: "in_progress", verified_by_reporter: false };
  } else if (row.status === "closed" && !body.fixed) {
    const { data: ev } = await supabase
      .from("complaint_events")
      .select("to_status, created_at")
      .eq("complaint_id", row.id)
      .eq("to_status", "closed")
      .order("created_at", { ascending: false })
      .limit(1);
    if (!withinReopenWindow(closedAt(row, (ev ?? []) as { to_status: Status; created_at: string }[]))) {
      throw new PipelineError("INVALID_TRANSITION", `Reopening is only possible within ${REOPEN_WINDOW_DAYS} days`);
    }
    patch = { status: "in_progress", verified_by_reporter: false };
  } else {
    throw new PipelineError("INVALID_TRANSITION", `Cannot ${body.fixed ? "confirm" : "reopen"} a ${row.status} complaint`);
  }

  const { data: updated, error: upErr } = await supabase
    .from("complaints")
    .update(patch)
    .eq("id", row.id)
    .eq("status", row.status) // optimistic: someone else may have moved it meanwhile
    .select("id, status, rating, verified_by_reporter")
    .maybeSingle();
  if (upErr) {
    if (upErr.code === "P0001") throw new PipelineError("INVALID_TRANSITION", "That status change is not allowed");
    console.error("[tracking] verify failed", upErr.code, upErr.message);
    throw new PipelineError("INTERNAL", "Could not update the complaint");
  }
  if (!updated) throw new PipelineError("INVALID_TRANSITION", "The complaint changed meanwhile — refresh and try again");

  if (!body.fixed && body.reason) {
    const as = isAssameseText(body.reason);
    const { error: evErr } = await createAdminClient()
      .from("complaint_events")
      .insert({
        complaint_id: row.id,
        actor_id: viewer.id,
        type: "note",
        note_en: as ? null : body.reason,
        note_as: as ? body.reason : null,
      });
    if (evErr) console.warn("[tracking] reason note failed", evErr.code);
  }
  return updated as VerifyResult;
}
