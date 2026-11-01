import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Profile, Status } from "@/lib/domain";
import { PipelineError } from "@/lib/complaints";
import { isManager } from "@/lib/admin";
import { idFilter } from "@/lib/tracking";
import { hasBengaliDrift } from "@/lib/utils";
import { createAdminClient } from "@/lib/supabase/admin";

/*
 * Authorization for M8 (chat, reply draft, resolution check).
 * - The ticket is read with the caller's RLS client: RLS returns the base row only to the owner, admins of
 *   the ticket's department / super admin, and the assignee. Anyone else gets 404 (never "exists but forbidden").
 * - Public-ticket viewers read through complaints_public, which this module never uses, so they cannot chat.
 * - The service role is used only after this check, for what RLS has no policy for (writing the AI
 *   translation onto a message, reading staff names, downloading photos, writing ai_meta).
 */

export type Actor = { id: string; profile: Profile };
export type TicketRole = "owner" | "manager" | "assignee";

export type AssistTicket = {
  id: string;
  code: string;
  user_id: string | null;
  anonymous: boolean;
  department_id: string | null;
  assignee_id: string | null;
  status: Status;
  priority: number;
  category: string;
  title_en: string | null;
  title_as: string | null;
  summary_en: string | null;
  summary_as: string | null;
  original_lang: "en" | "as";
  sla_due_at: string | null;
  image_urls: string[] | null;
  resolution_photo_url: string | null;
  resolution_note_en: string | null;
  resolution_note_as: string | null;
  ai_meta: Record<string, unknown> | null;
  department: { name_en: string; name_as: string } | null;
};

const COLUMNS =
  "id, code, user_id, anonymous, department_id, assignee_id, status, priority, category, title_en, title_as, " +
  "summary_en, summary_as, original_lang, sla_due_at, image_urls, resolution_photo_url, resolution_note_en, " +
  "resolution_note_as, ai_meta, department:departments(name_en, name_as)";

export async function loadTicket(
  supabase: SupabaseClient,
  actor: Actor,
  idOrCode: string,
): Promise<{ ticket: AssistTicket; role: TicketRole; manager: boolean }> {
  const f = idFilter(idOrCode);
  if (!f) throw new PipelineError("NOT_FOUND", "Complaint not found");
  const { data, error } = await supabase.from("complaints").select(COLUMNS).eq(f.col, f.value).maybeSingle();
  if (error) {
    console.error("[assist] load failed", error.code, error.message);
    throw new PipelineError("INTERNAL", "Could not load the complaint");
  }
  if (!data) throw new PipelineError("NOT_FOUND", "Complaint not found");
  const ticket = data as unknown as AssistTicket;
  // Anonymous reports keep the reporter out of the row (migration 13). Resolve it server-side only, after RLS
  // has already confirmed the caller may see this ticket; it is used for roles, labels and notifications and
  // never leaves the server.
  if (!ticket.user_id && ticket.anonymous) {
    const { data: rep } = await createAdminClient().rpc("complaint_reporter", { cid: ticket.id });
    ticket.user_id = typeof rep === "string" ? rep : null;
  }
  const manager = isManager(actor.profile, ticket.department_id);
  const role: TicketRole | null = manager
    ? "manager"
    : ticket.assignee_id === actor.id
      ? "assignee"
      : ticket.user_id === actor.id
        ? "owner"
        : null;
  // RLS returned the row, so one of the three must hold; defend anyway.
  if (!role) throw new PipelineError("NOT_FOUND", "Complaint not found");
  return { ticket, role, manager };
}

/** Admin tools (reply draft, resolution check): admins of the ticket's department or super admin only. */
export async function loadTicketForManager(supabase: SupabaseClient, actor: Actor, idOrCode: string) {
  const r = await loadTicket(supabase, actor, idOrCode);
  if (!r.manager) throw new PipelineError("FORBIDDEN", "Only admins of this complaint's department can use this");
  return r.ticket;
}

/**
 * Assamese drift guard (PRD 9): run once; if Assamese output contains Bengali র, one strict retry;
 * if it still drifts, replace র → ৰ as the last resort.
 */
export async function withAssameseGuard<T>(
  needsAssamese: boolean,
  ask: (strict: boolean) => Promise<T>,
  pickText: (r: T) => string,
  fix: (r: T, replace: (s: string) => string) => T,
): Promise<T> {
  let r: T = await ask(false);
  if (!needsAssamese || !hasBengaliDrift(pickText(r))) return r;
  try {
    r = await ask(true);
  } catch {
    /* keep the first answer and fix it below */
  }
  if (hasBengaliDrift(pickText(r))) r = fix(r, (s) => s.replaceAll("র", "ৰ"));
  return r;
}

