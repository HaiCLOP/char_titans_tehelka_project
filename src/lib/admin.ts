import "server-only";
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  AdminSimilarItemSchema,
  AdminStatsSchema,
  ComplaintUpdateResultSchema,
  InternalNoteSchema,
  OPEN_STATUSES,
  STATUSES,
  StaffMemberSchema,
  type AdminSimilarItem,
  type AdminStats,
  type ComplaintPatch,
  type ComplaintUpdateResult,
  type InternalNote,
  type LinkRequest,
  type Profile,
  type ResolveRequest,
  type StaffMember,
  type Status,
  type Transition,
} from "@/lib/domain";
import { embedText } from "@/lib/ai/intake";
import { PipelineError } from "@/lib/complaints";
import { createAdminClient } from "@/lib/supabase/admin";
import { idFilter } from "@/lib/tracking";
import { isAssameseText } from "@/lib/utils";

/**
 * Write side of the ticket lifecycle for admins and field staff (M5).
 *
 * Authorization model
 * - Every ticket is first read with the caller's RLS client: if RLS hides it, the answer is 404.
 * - Updates run with the caller's RLS client, so the DB triggers decide what is legal:
 *   enforce_transition (P0001 → 409 INVALID_TRANSITION) and complaints_a_column_guard (42501:
 *   FORBIDDEN_STATUS → 409, FORBIDDEN_COLUMNS → 403). The checks below only give friendlier errors first.
 * - The service role is used only after the caller was authorized, for things RLS has no policy for:
 *   complaint_events notes (no insert policy by design), a dept_admin moving a ticket to another department
 *   (the admin update policy's implicit WITH CHECK keeps department_id = my_department()), the parent's
 *   supporter count when linking duplicates, and resolution photo uploads by field staff (storage policy
 *   only lets admins upload to resolution-photos).
 */

type Client = SupabaseClient;
export type Actor = { id: string; profile: Profile };

const RESOLUTION_BUCKET = "resolution-photos";
const ADMIN_SIMILAR_THRESHOLD = 0.75;

const UPDATE_COLUMNS =
  "id, code, status, priority, category, department_id, assignee_id, parent_id, is_urgent, is_sensitive, visibility, sla_due_at, updated_at";

type Row = ComplaintUpdateResult & { user_id: string | null; metoo_count: number; summary_en: string | null; original_text: string };

const LOAD_COLUMNS = `${UPDATE_COLUMNS}, user_id, metoo_count, summary_en, original_text`;

const isOpen = (s: Status) => (OPEN_STATUSES as readonly Status[]).includes(s);

/** Admin of the ticket's department, or super admin. */
export function isManager(profile: Profile, departmentId: string | null) {
  return (
    profile.role === "super_admin" ||
    (profile.role === "dept_admin" && !!profile.department_id && departmentId === profile.department_id)
  );
}

/**
 * Which department an admin's dashboard/queue covers. dept_admin: always their own (null department →
 * FORBIDDEN, never "everything"). super_admin: the requested one, or null = all departments.
 */
export function scopeDepartment(profile: Profile, requested?: string | null): string | null {
  if (profile.role === "super_admin") return requested ?? null;
  if (profile.role === "dept_admin" && profile.department_id) return profile.department_id;
  throw new PipelineError("FORBIDDEN", "You are not assigned to a department yet");
}

function dbError(e: { code?: string; message: string }, what: string): PipelineError {
  if (e.code === "P0001") return new PipelineError("INVALID_TRANSITION", "That status change is not allowed");
  if (e.code === "42501") {
    if (e.message.includes("FORBIDDEN_STATUS")) return new PipelineError("INVALID_TRANSITION", "That status change is not allowed");
    return new PipelineError("FORBIDDEN", "You cannot change that");
  }
  if (e.code === "23514" || e.code === "23503" || e.code === "22P02") return new PipelineError("VALIDATION_ERROR", "Invalid value");
  console.error(`[admin] ${what} failed`, e.code, e.message);
  return new PipelineError("INTERNAL", "Could not update the complaint");
}

async function loadRow(supabase: Client, idOrCode: string): Promise<Row> {
  const f = idFilter(idOrCode);
  if (!f) throw new PipelineError("NOT_FOUND", "Complaint not found");
  const { data, error } = await supabase.from("complaints").select(LOAD_COLUMNS).eq(f.col, f.value).maybeSingle();
  if (error) throw dbError(error, "load");
  if (!data) throw new PipelineError("NOT_FOUND", "Complaint not found");
  return data as unknown as Row;
}

/** Status update with an optimistic check on the previous status. */
async function updateRow(supabase: Client, id: string, expected: Status, patch: Record<string, unknown>): Promise<ComplaintUpdateResult> {
  const { data, error } = await supabase
    .from("complaints")
    .update(patch)
    .eq("id", id)
    .eq("status", expected)
    .select(UPDATE_COLUMNS)
    .maybeSingle();
  if (error) throw dbError(error, "update");
  if (!data) throw new PipelineError("INVALID_TRANSITION", "The complaint changed meanwhile — refresh and try again");
  return ComplaintUpdateResultSchema.parse(data);
}

type EventInput = { type: "note" | "assigned"; en?: string | null; as?: string | null };

/** complaint_events has no insert policy: written with the service role after the caller's update succeeded. */
async function addEvents(complaintId: string, actorId: string, events: EventInput[]) {
  if (events.length === 0) return;
  const { error } = await createAdminClient()
    .from("complaint_events")
    .insert(events.map((e) => ({ complaint_id: complaintId, actor_id: actorId, type: e.type, note_en: e.en ?? null, note_as: e.as ?? null })));
  if (error) console.warn("[admin] event insert failed", error.code, error.message);
}

/** Free text from staff goes into the column of the script it is written in. */
const byScript = (text: string): EventInput => (isAssameseText(text) ? { type: "note", as: text } : { type: "note", en: text });

// ---------- PATCH /api/complaints/[id] ----------

export async function patchComplaint(supabase: Client, actor: Actor, idOrCode: string, body: ComplaintPatch): Promise<ComplaintUpdateResult> {
  const row = await loadRow(supabase, idOrCode);
  const mgr = isManager(actor.profile, row.department_id);
  const assignee = row.assignee_id === actor.id;

  if (!mgr) {
    if (!assignee) throw new PipelineError("FORBIDDEN", "Only admins of this department can change this complaint");
    const keys = Object.entries(body).filter(([, v]) => v !== undefined).map(([k]) => k);
    if (keys.some((k) => k !== "status" && k !== "note")) throw new PipelineError("FORBIDDEN", "Assigned staff can only update the status");
    if (body.status && body.status !== "in_progress") {
      throw new PipelineError("INVALID_TRANSITION", body.status === "resolved" ? "Use Mark resolved (note and photo)" : "That status change is not allowed");
    }
  }
  if (body.status === "resolved") throw new PipelineError("VALIDATION_ERROR", "Use POST /resolve to resolve a complaint");
  if (body.status === "duplicate") throw new PipelineError("VALIDATION_ERROR", "Use POST /link to mark a duplicate");

  const patch: Record<string, unknown> = {};
  const events: EventInput[] = [];
  let targetStatus: Status | undefined = body.status && body.status !== row.status ? body.status : undefined;

  if (body.priority !== undefined && body.priority !== row.priority) patch.priority = body.priority;
  if (body.category !== undefined && body.category !== row.category) patch.category = body.category;
  if (body.is_urgent !== undefined && body.is_urgent !== row.is_urgent) patch.is_urgent = body.is_urgent;
  if (body.is_sensitive !== undefined && body.is_sensitive !== row.is_sensitive) {
    patch.is_sensitive = body.is_sensitive;
    if (body.is_sensitive) patch.visibility = "private"; // DB constraint sensitive_is_private
  }

  // Department transfer: only before work is assigned, and never together with an assignee.
  let transfer: { id: string; name_en: string; name_as: string } | null = null;
  if (body.department_id !== undefined && body.department_id !== row.department_id) {
    if (row.assignee_id || row.status === "assigned" || row.status === "in_progress") {
      throw new PipelineError("VALIDATION_ERROR", "Unassign the complaint before moving it to another department");
    }
    if (body.assignee_id) throw new PipelineError("VALIDATION_ERROR", "Move the complaint first, then assign staff of the new department");
    const { data: dept } = await supabase.from("departments").select("id, name_en, name_as").eq("id", body.department_id).maybeSingle();
    if (!dept) throw new PipelineError("VALIDATION_ERROR", "Unknown department");
    transfer = dept as { id: string; name_en: string; name_as: string };
  }

  // Assignment. Assigning moves the ticket to `assigned`; unassigning an assigned ticket moves it back to `triaged`.
  let assigneeChanged = false;
  if (body.assignee_id !== undefined && body.assignee_id !== row.assignee_id) {
    if (body.assignee_id === null) {
      if (row.status === "in_progress") throw new PipelineError("VALIDATION_ERROR", "Work is in progress — move it back to Assigned with another person instead");
      patch.assignee_id = null;
      if (!targetStatus && row.status === "assigned") targetStatus = "triaged";
    } else {
      const { data: person } = await supabase.from("profiles").select("id, role, department_id").eq("id", body.assignee_id).maybeSingle();
      const p = person as { id: string; role: string; department_id: string | null } | null;
      if (!p || !["field_staff", "dept_admin"].includes(p.role) || !row.department_id || p.department_id !== row.department_id) {
        throw new PipelineError("VALIDATION_ERROR", "Pick field staff of this complaint's department");
      }
      patch.assignee_id = p.id;
      assigneeChanged = true;
      if (!targetStatus && ["submitted", "needs_review", "triaged", "in_progress"].includes(row.status)) targetStatus = "assigned";
    }
  }
  if (targetStatus === "assigned" && !(patch.assignee_id ?? row.assignee_id)) {
    throw new PipelineError("VALIDATION_ERROR", "Choose who will do the work first");
  }
  if (targetStatus) patch.status = targetStatus;

  if (body.reason && targetStatus === "rejected") events.push(byScript(body.reason));
  if (body.note) events.push(byScript(body.note));
  if (assigneeChanged && targetStatus !== "assigned") events.push({ type: "assigned" });

  let result: ComplaintUpdateResult | null = null;
  let expected = row.status;

  // submitted / needs_review → assigned goes through triaged (the transition table has no direct move).
  if (targetStatus === "assigned" && (row.status === "submitted" || row.status === "needs_review")) {
    await updateRow(supabase, row.id, row.status, { status: "triaged" });
    expected = "triaged";
  }

  const userPatch = { ...patch };
  if (transfer && actor.profile.role === "super_admin") userPatch.department_id = transfer.id;
  if (Object.keys(userPatch).length > 0) result = await updateRow(supabase, row.id, expected, userPatch);

  if (transfer && actor.profile.role !== "super_admin") {
    // A dept_admin hands the ticket to another department; afterwards RLS no longer shows it to them.
    const { data, error } = await createAdminClient()
      .from("complaints")
      .update({ department_id: transfer.id })
      .eq("id", row.id)
      .eq("department_id", row.department_id!)
      .select(UPDATE_COLUMNS)
      .maybeSingle();
    if (error) throw dbError(error, "transfer");
    if (!data) throw new PipelineError("INVALID_TRANSITION", "The complaint changed meanwhile — refresh and try again");
    result = ComplaintUpdateResultSchema.parse(data);
  }
  if (transfer) {
    events.push({ type: "note", en: `Moved to ${transfer.name_en}`, as: `${transfer.name_as}লৈ পঠিওৱা হ'ল` });
  }

  await addEvents(row.id, actor.id, events);
  return result ?? ComplaintUpdateResultSchema.parse(row);
}

// ---------- POST /api/complaints/[id]/resolve ----------

export async function resolveComplaint(supabase: Client, actor: Actor, idOrCode: string, body: ResolveRequest): Promise<ComplaintUpdateResult> {
  const row = await loadRow(supabase, idOrCode);
  const mgr = isManager(actor.profile, row.department_id);
  if (!mgr && row.assignee_id !== actor.id) throw new PipelineError("FORBIDDEN", "Only the assigned staff or an admin can resolve this");
  if (!mgr && !body.photo_path) throw new PipelineError("VALIDATION_ERROR", "An after photo is required");
  if (body.photo_path) {
    if (!body.photo_path.startsWith(`${row.id}/`)) throw new PipelineError("VALIDATION_ERROR", "That photo belongs to another complaint");
    const [folder, file] = body.photo_path.split("/");
    const { data: found } = await createAdminClient().storage.from(RESOLUTION_BUCKET).list(folder, { search: file, limit: 1 });
    if (!found?.some((o) => o.name === file)) throw new PipelineError("VALIDATION_ERROR", "Upload the photo first");
  }

  let expected = row.status;
  if (row.status === "assigned") {
    // Staff may resolve without pressing "Start work" first: record both steps.
    await updateRow(supabase, row.id, "assigned", { status: "in_progress" });
    expected = "in_progress";
  } else if (row.status !== "in_progress") {
    throw new PipelineError("INVALID_TRANSITION", `Cannot resolve a ${row.status} complaint`);
  }
  const as = isAssameseText(body.note);
  return updateRow(supabase, row.id, expected, {
    status: "resolved",
    resolution_note_en: as ? null : body.note,
    resolution_note_as: as ? body.note : null,
    resolution_photo_url: body.photo_path ?? null,
  });
}

// ---------- POST /api/upload/resolution ----------

/**
 * Stores an after-photo at resolution-photos/{complaint id}/{uuid}.{ext}. The storage policy only lets admins
 * upload there, so after checking (RLS read + role) that the caller is the assignee or an admin of the ticket,
 * the file is written with the service role.
 */
export async function uploadResolutionPhoto(
  supabase: Client,
  actor: Actor,
  idOrCode: string,
  bytes: Uint8Array,
  type: "image/jpeg" | "image/png" | "image/webp",
): Promise<string> {
  const row = await loadRow(supabase, idOrCode);
  if (!isManager(actor.profile, row.department_id) && row.assignee_id !== actor.id) {
    throw new PipelineError("FORBIDDEN", "Only the assigned staff or an admin can add an after photo");
  }
  if (!isOpen(row.status)) throw new PipelineError("INVALID_TRANSITION", "This complaint is no longer open");
  const ext = type === "image/png" ? "png" : type === "image/webp" ? "webp" : "jpg";
  const path = `${row.id}/${randomUUID()}.${ext}`;
  const { error } = await createAdminClient().storage.from(RESOLUTION_BUCKET).upload(path, bytes, { contentType: type, upsert: false });
  if (error) {
    console.error("[admin] resolution upload failed", error.message);
    throw new PipelineError("INTERNAL", "Could not store the image");
  }
  return path;
}

// ---------- POST /api/complaints/[id]/link ----------

/**
 * Link as duplicate: child.parent_id = parent, child → duplicate (DB transition rules apply), and the parent's
 * metoo_count grows by the child's reporter + the child's own supporters (1 + child.metoo_count), so the
 * parent shows how many people are affected. Unlink reverses exactly that (never below the parent's real
 * supporter rows) and moves the child back to triaged. complaint_supporters rows are not moved, so an unlink
 * is lossless. The two writes are not one transaction; the parent count is best-effort.
 */
export async function linkComplaint(supabase: Client, actor: Actor, idOrCode: string, body: LinkRequest): Promise<ComplaintUpdateResult> {
  const child = await loadRow(supabase, idOrCode);
  if (!isManager(actor.profile, child.department_id)) throw new PipelineError("FORBIDDEN", "Only admins of this department can link duplicates");
  const admin = createAdminClient();
  const weight = 1 + child.metoo_count;

  if ("unlink" in body) {
    if (child.status !== "duplicate" || !child.parent_id) throw new PipelineError("INVALID_TRANSITION", "This complaint is not linked");
    const parentId = child.parent_id;
    const result = await updateRow(supabase, child.id, "duplicate", { status: "triaged", parent_id: null });
    const [{ data: parent }, { count }] = await Promise.all([
      admin.from("complaints").select("id, code, metoo_count").eq("id", parentId).maybeSingle(),
      admin.from("complaint_supporters").select("user_id", { count: "exact", head: true }).eq("complaint_id", parentId),
    ]);
    if (parent) {
      const p = parent as { id: string; code: string; metoo_count: number };
      await admin.from("complaints").update({ metoo_count: Math.max(count ?? 0, p.metoo_count - weight) }).eq("id", p.id);
      await addEvents(child.id, actor.id, [{ type: "note", en: `Unlinked from ${p.code}`, as: `${p.code}ৰ পৰা পৃথক কৰা হ'ল` }]);
      await addEvents(p.id, actor.id, [{ type: "note", en: `${child.code} was unlinked`, as: `${child.code} পৃথক কৰা হ'ল` }]);
    }
    return result;
  }

  if (body.parent_id === child.id) throw new PipelineError("VALIDATION_ERROR", "A complaint cannot duplicate itself");
  if (child.parent_id) throw new PipelineError("VALIDATION_ERROR", "Already linked — unlink it first");
  const { data: parentRow } = await supabase.from("complaints").select("id, code, status, parent_id, metoo_count").eq("id", body.parent_id).maybeSingle();
  const parent = parentRow as { id: string; code: string; status: Status; parent_id: string | null; metoo_count: number } | null;
  if (!parent) throw new PipelineError("NOT_FOUND", "The original complaint was not found");
  if (parent.parent_id || parent.status === "duplicate" || parent.status === "rejected") {
    throw new PipelineError("VALIDATION_ERROR", "Link to the original complaint, not to another duplicate");
  }
  const { count: ownChildren } = await supabase.from("complaints").select("id", { count: "exact", head: true }).eq("parent_id", child.id);
  if ((ownChildren ?? 0) > 0) throw new PipelineError("VALIDATION_ERROR", "Other complaints are linked to this one — link the other way round");

  const result = await updateRow(supabase, child.id, child.status, { status: "duplicate", parent_id: parent.id });
  const { data: fresh } = await admin.from("complaints").select("metoo_count").eq("id", parent.id).maybeSingle();
  const current = (fresh as { metoo_count: number } | null)?.metoo_count ?? parent.metoo_count;
  const { error } = await admin.from("complaints").update({ metoo_count: current + weight }).eq("id", parent.id);
  if (error) console.warn("[admin] parent count update failed", error.code);
  await addEvents(child.id, actor.id, [{ type: "note", en: `Merged into ${parent.code}`, as: `${parent.code}ৰ সৈতে একত্ৰ কৰা হ'ল` }]);
  await addEvents(parent.id, actor.id, [{ type: "note", en: `${child.code} merged into this complaint`, as: `${child.code} এই অভিযোগৰ সৈতে একত্ৰ কৰা হ'ল` }]);
  return result;
}

// ---------- GET /api/complaints/[id]/similar (admins) ----------

const MatchRows = AdminSimilarItemSchema.pick({ id: true, code: true, title_en: true, title_as: true, status: true, metoo_count: true, similarity: true }).array();

/**
 * Possible duplicates of a ticket for its admins, private tickets included but only those the admin's RLS
 * client can read (own department; all for super admin). Uses the ticket's stored embedding (service role:
 * embeddings are never sent to the browser), else embeds the summary. null = no embedding (AI down).
 */
export async function similarForComplaint(supabase: Client, actor: Actor, idOrCode: string): Promise<AdminSimilarItem[] | null> {
  const row = await loadRow(supabase, idOrCode);
  if (!isManager(actor.profile, row.department_id)) throw new PipelineError("FORBIDDEN", "Admins only");
  const admin = createAdminClient();
  const { data: e } = await admin.from("complaints").select("embedding").eq("id", row.id).maybeSingle();
  let vec: unknown = (e as { embedding: unknown } | null)?.embedding ?? null;
  if (!vec) {
    const text = row.summary_en || row.original_text;
    vec = text ? await embedText(text) : null;
  }
  if (!vec) return null;
  const { data, error } = await admin.rpc("match_complaints", {
    query_embedding: vec,
    match_threshold: ADMIN_SIMILAR_THRESHOLD,
    match_count: 8,
    filter_location: null,
    within_days: 30,
    include_private: true,
  });
  if (error) {
    console.error("[admin] match failed", error.code, error.message);
    throw new PipelineError("INTERNAL", "Similarity search failed");
  }
  const matches = MatchRows.parse(data ?? []).filter((m) => m.id !== row.id);
  if (matches.length === 0) return [];
  const { data: visible } = await supabase.from("complaints").select("id, department_id, created_at").in("id", matches.map((m) => m.id));
  const seen = new Map(((visible ?? []) as { id: string; department_id: string | null; created_at: string }[]).map((v) => [v.id, v]));
  return matches
    .filter((m) => seen.has(m.id))
    .slice(0, 5)
    .map((m) => ({ ...m, department_id: seen.get(m.id)!.department_id, created_at: seen.get(m.id)!.created_at }));
}

// ---------- internal notes (messages.internal = true) ----------

async function requireStaffOf(supabase: Client, actor: Actor, idOrCode: string) {
  const row = await loadRow(supabase, idOrCode);
  if (!isManager(actor.profile, row.department_id) && row.assignee_id !== actor.id) {
    throw new PipelineError("FORBIDDEN", "Internal notes are for staff of this complaint");
  }
  return row;
}

export async function listInternalNotes(supabase: Client, actor: Actor, idOrCode: string): Promise<InternalNote[]> {
  const row = await requireStaffOf(supabase, actor, idOrCode);
  const { data, error } = await supabase
    .from("messages")
    .select("id, body, created_at, sender_id")
    .eq("complaint_id", row.id)
    .eq("internal", true)
    .order("created_at", { ascending: true })
    .limit(100);
  if (error) throw dbError(error, "notes");
  const rows = (data ?? []) as { id: number; body: string; created_at: string; sender_id: string | null }[];
  const ids = [...new Set(rows.map((r) => r.sender_id).filter((x): x is string => Boolean(x)))];
  // Field staff cannot read other profiles under RLS; names are staff names, read with the service role.
  const { data: people } = ids.length
    ? await createAdminClient().from("profiles").select("id, full_name").in("id", ids)
    : { data: [] };
  const names = new Map(((people ?? []) as { id: string; full_name: string | null }[]).map((p) => [p.id, p.full_name]));
  return rows.map((r) =>
    InternalNoteSchema.parse({
      id: r.id,
      body: r.body,
      created_at: r.created_at,
      author: r.sender_id ? (names.get(r.sender_id) ?? null) : null,
      mine: r.sender_id === actor.id,
    }),
  );
}

export async function addInternalNote(supabase: Client, actor: Actor, idOrCode: string, body: string): Promise<InternalNote> {
  const row = await requireStaffOf(supabase, actor, idOrCode);
  const { data, error } = await supabase
    .from("messages")
    .insert({ complaint_id: row.id, sender_id: actor.id, body, lang: isAssameseText(body) ? "as" : "en", internal: true })
    .select("id, body, created_at")
    .single();
  if (error) throw dbError(error, "note insert");
  const d = data as { id: number; body: string; created_at: string };
  return { ...d, author: actor.profile.full_name, mine: true };
}

// ---------- GET /api/admin/staff ----------

export async function listStaff(supabase: Client, actor: Actor, department?: string | null): Promise<StaffMember[]> {
  const dept = actor.profile.role === "super_admin" ? department : actor.profile.department_id;
  if (actor.profile.role !== "super_admin" && department && department !== actor.profile.department_id) {
    throw new PipelineError("FORBIDDEN", "Other departments are not yours to staff");
  }
  if (!dept) return [];
  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, role")
    .eq("department_id", dept)
    .in("role", ["field_staff", "dept_admin"])
    .eq("active", true)
    .order("role", { ascending: false })
    .order("full_name");
  if (error) throw dbError(error, "staff");
  return StaffMemberSchema.array().parse(data ?? []);
}

// ---------- GET /api/meta/transitions ----------

export async function listTransitions(supabase: Client): Promise<Transition[]> {
  const { data, error } = await supabase.from("status_transitions").select("from_status, to_status");
  if (error) throw dbError(error, "transitions");
  return ((data ?? []) as { from_status: Status; to_status: Status }[])
    .filter((t) => (STATUSES as readonly string[]).includes(t.from_status))
    .map((t) => ({ from: t.from_status, to: t.to_status }));
}

// ---------- GET /api/admin/stats ----------

type RawStats = {
  open: number;
  in_progress: number;
  overdue: number;
  avg_resolution_hours: number | null;
  by_lang: { en: number; as: number };
};

export async function getAdminStats(supabase: Client, actor: Actor, days: number, requested?: string | null): Promise<AdminStats> {
  const dept = scopeDepartment(actor.profile, requested);
  const weekAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
  const now = new Date().toISOString();
  let fixedQ = supabase.from("complaints").select("id", { count: "exact", head: true }).gte("resolved_at", weekAgo).is("parent_id", null);
  let reviewQ = supabase.from("complaints").select("id", { count: "exact", head: true }).eq("status", "needs_review");
  let ratingQ = supabase.from("complaints").select("rating").not("rating", "is", null).limit(2000);
  let overdueQ = supabase
    .from("complaints")
    .select("id, code, title_en, title_as, priority, status, sla_due_at")
    .lt("sla_due_at", now)
    .in("status", [...OPEN_STATUSES])
    .is("parent_id", null);
  if (dept) {
    fixedQ = fixedQ.eq("department_id", dept);
    reviewQ = reviewQ.eq("department_id", dept);
    ratingQ = ratingQ.eq("department_id", dept);
    overdueQ = overdueQ.eq("department_id", dept);
  }

  const [statsRes, trendRes, catRes, loadRes, fixedRes, reviewRes, ratingRes, overdueRes] = await Promise.all([
    supabase.rpc("dashboard_stats", { dept }),
    supabase.rpc("trend_by_day", { dept, days }),
    supabase.rpc("category_breakdown", { dept, days }),
    actor.profile.role === "super_admin" && !dept ? supabase.rpc("department_load") : Promise.resolve({ data: [], error: null }),
    fixedQ,
    reviewQ,
    ratingQ,
    overdueQ.order("sla_due_at", { ascending: true }).limit(5),
  ]);
  const firstError = [statsRes, trendRes, catRes, loadRes, fixedRes, reviewRes, ratingRes, overdueRes].find((r) => r.error)?.error;
  if (firstError) {
    console.error("[admin] stats failed", firstError.code, firstError.message);
    throw new PipelineError("INTERNAL", "Could not load the dashboard");
  }

  const s = (statsRes.data ?? {}) as Partial<RawStats>;
  const ratings = ((ratingRes.data ?? []) as { rating: number }[]).map((r) => r.rating);
  const num = (v: unknown) => Number(v ?? 0);

  return AdminStatsSchema.parse({
    department_id: dept,
    days,
    stats: {
      open: num(s.open) + num(s.in_progress),
      in_progress: num(s.in_progress),
      overdue: num(s.overdue),
      needs_review: reviewRes.count ?? 0,
      fixed_week: fixedRes.count ?? 0,
      avg_resolution_hours: s.avg_resolution_hours ?? null,
      rating_avg: ratings.length ? Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 10) / 10 : null,
      rating_count: ratings.length,
      by_lang: { en: num(s.by_lang?.en), as: num(s.by_lang?.as) },
    },
    trend: ((trendRes.data ?? []) as { day: string; created: number; resolved: number }[]).map((r) => ({
      day: String(r.day),
      created: num(r.created),
      resolved: num(r.resolved),
    })),
    categories: ((catRes.data ?? []) as { category: string; total: number }[]).map((r) => ({ category: r.category, total: num(r.total) })),
    load: ((loadRes.data ?? []) as { department_id: string; name_en: string; name_as: string; open_count: number; overdue: number }[]).map((r) => ({
      ...r,
      open_count: num(r.open_count),
      overdue: num(r.overdue),
    })),
    overdue: overdueRes.data ?? [],
  });
}
