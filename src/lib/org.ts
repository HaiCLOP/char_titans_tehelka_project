import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import {
  DepartmentSchema,
  MemberSchema,
  SlaHoursSchema,
  DEFAULT_SLA_HOURS,
  type Department,
  DepartmentInputSchema,
  type DepartmentPatch,
  type Member,
  type MemberAdd,
  type MemberPatch,
  type Profile,
  type Role,
} from "@/lib/domain";
import { PipelineError } from "@/lib/complaints";
import { createAdminClient } from "@/lib/supabase/admin";
import { emailEnabled, inviteEmail, sendEmail } from "@/lib/email";
import en from "../../messages/en.json";
import as from "../../messages/as.json";

/**
 * S18 — departments and members (super admin only; the routes call requireRole("super_admin")).
 *
 * Writes go through the super admin's RLS client ("departments super admin", "super admin manages
 * profiles"); the profiles_guard trigger (migration 10) is the final word on who may change role,
 * department, skills, coverage and active. The service role is used only for what RLS cannot express:
 * finding an account by email and reading members' emails (auth.users), via service-role-only RPCs.
 */

type Client = SupabaseClient;
export type Actor = { id: string; profile: Profile };

const ASSIGNABLE: Role[] = ["field_staff", "dept_admin"];
const OPEN_JOB_STATUSES = ["assigned", "in_progress"] as const;
const MEMBER_COLUMNS = "id, full_name, role, department_id, skills, coverage_location_ids, active, last_assigned_at";

type ProfileRow = {
  id: string;
  full_name: string | null;
  role: Role;
  department_id: string | null;
  skills: string[] | null;
  coverage_location_ids: string[] | null;
  active: boolean;
  last_assigned_at: string | null;
};

function dbError(e: { code?: string; message: string }, what: string): PipelineError {
  if (e.code === "42501") {
    if (e.message.includes("SELF_DEMOTE")) return new PipelineError("FORBIDDEN", "You cannot demote or deactivate yourself");
    return new PipelineError("FORBIDDEN", "You cannot change that");
  }
  if (e.code === "23503") return new PipelineError("CONFLICT", "It is still in use");
  if (e.code === "23514" || e.code === "22P02") return new PipelineError("VALIDATION_ERROR", "Invalid value");
  console.error(`[org] ${what} failed`, e.code, e.message);
  return new PipelineError("INTERNAL", `Could not ${what}`);
}

// ---------- departments ----------

const DeptRow = z.object({
  id: z.string(),
  name_en: z.string(),
  name_as: z.string(),
  categories: z.array(z.string()).nullable(),
  sla_hours: z.unknown(),
  created_at: z.string(),
});

function toDepartment(raw: unknown, members: Map<string, number>, open: Map<string, number>): Department {
  const r = DeptRow.parse(raw);
  const sla = SlaHoursSchema.safeParse(
    Object.fromEntries(Object.entries((r.sla_hours ?? {}) as Record<string, unknown>).map(([k, v]) => [k, Number(v)])),
  );
  return DepartmentSchema.parse({
    ...r,
    categories: r.categories ?? [],
    sla_hours: sla.success ? sla.data : DEFAULT_SLA_HOURS,
    member_count: members.get(r.id) ?? 0,
    open_count: open.get(r.id) ?? 0,
  });
}

async function departmentCounts(supabase: Client) {
  const [people, load] = await Promise.all([
    supabase.from("profiles").select("department_id").not("department_id", "is", null).limit(5000),
    supabase.rpc("department_load"),
  ]);
  const members = new Map<string, number>();
  for (const p of (people.data ?? []) as { department_id: string }[]) members.set(p.department_id, (members.get(p.department_id) ?? 0) + 1);
  const open = new Map<string, number>();
  for (const l of (load.data ?? []) as { department_id: string; open_count: number }[]) open.set(l.department_id, Number(l.open_count ?? 0));
  return { members, open };
}

export async function listDepartments(supabase: Client): Promise<Department[]> {
  const [{ data, error }, counts] = await Promise.all([
    supabase.from("departments").select("id, name_en, name_as, categories, sla_hours, created_at").order("name_en"),
    departmentCounts(supabase),
  ]);
  if (error) throw dbError(error, "load departments");
  return (data ?? []).map((d) => toDepartment(d, counts.members, counts.open));
}

export async function createDepartment(supabase: Client, input: z.output<typeof DepartmentInputSchema>): Promise<Department> {
  const { data, error } = await supabase
    .from("departments")
    .insert({ name_en: input.name_en, name_as: input.name_as, categories: input.categories, sla_hours: input.sla_hours })
    .select("id, name_en, name_as, categories, sla_hours, created_at")
    .single();
  if (error) throw dbError(error, "create the department");
  return toDepartment(data, new Map(), new Map());
}

export async function updateDepartment(supabase: Client, id: string, patch: DepartmentPatch): Promise<Department> {
  const { data, error } = await supabase
    .from("departments")
    .update(patch)
    .eq("id", id)
    .select("id, name_en, name_as, categories, sla_hours, created_at")
    .maybeSingle();
  if (error) throw dbError(error, "update the department");
  if (!data) throw new PipelineError("NOT_FOUND", "Department not found");
  const counts = await departmentCounts(supabase);
  return toDepartment(data, counts.members, counts.open);
}

/** Deletes a department only when no complaint and no member references it. */
export async function deleteDepartment(supabase: Client, id: string): Promise<void> {
  const [{ data: dept }, complaints, members] = await Promise.all([
    supabase.from("departments").select("id").eq("id", id).maybeSingle(),
    supabase.from("complaints").select("id", { count: "exact", head: true }).eq("department_id", id),
    supabase.from("profiles").select("id", { count: "exact", head: true }).eq("department_id", id),
  ]);
  if (!dept) throw new PipelineError("NOT_FOUND", "Department not found");
  const c = complaints.count ?? 0;
  const m = members.count ?? 0;
  if (c > 0 || m > 0) {
    const parts = [c > 0 ? `${c} complaint${c === 1 ? "" : "s"}` : null, m > 0 ? `${m} member${m === 1 ? "" : "s"}` : null].filter(Boolean);
    throw new PipelineError("CONFLICT", `This department still has ${parts.join(" and ")}. Move them to another department first.`);
  }
  const { error, count } = await supabase.from("departments").delete({ count: "exact" }).eq("id", id);
  if (error) throw dbError(error, "delete the department");
  if (!count) throw new PipelineError("NOT_FOUND", "Department not found");
}

// ---------- members ----------

async function openJobs(supabase: Client, ids: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (ids.length === 0) return out;
  const { data, error } = await supabase
    .from("complaints")
    .select("assignee_id")
    .in("assignee_id", ids)
    .in("status", [...OPEN_JOB_STATUSES])
    .limit(5000);
  if (error) throw dbError(error, "count open jobs");
  for (const r of (data ?? []) as { assignee_id: string }[]) out.set(r.assignee_id, (out.get(r.assignee_id) ?? 0) + 1);
  return out;
}

async function emails(ids: string[]): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const { data, error } = await createAdminClient().rpc("admin_user_emails", { ids });
  if (error) {
    console.warn("[org] email lookup failed", error.code, error.message);
    return new Map();
  }
  return new Map(((data ?? []) as { id: string; email: string | null }[]).map((r) => [r.id, r.email ?? ""]));
}

async function toMembers(supabase: Client, rows: ProfileRow[]): Promise<Member[]> {
  const ids = rows.map((r) => r.id);
  const [jobs, mails] = await Promise.all([openJobs(supabase, ids), emails(ids)]);
  return rows.map((r) =>
    MemberSchema.parse({
      id: r.id,
      name: r.full_name,
      email: mails.get(r.id) || null,
      role: r.role,
      department_id: r.department_id,
      skills: r.skills ?? [],
      coverage_location_ids: r.coverage_location_ids ?? [],
      active: r.active,
      open_jobs: jobs.get(r.id) ?? 0,
      last_assigned_at: r.last_assigned_at,
    }),
  );
}

/** Members of a department, or (no department) everyone who is not a plain student. */
export async function listMembers(supabase: Client, department?: string | null): Promise<Member[]> {
  let q = supabase.from("profiles").select(MEMBER_COLUMNS);
  q = department ? q.eq("department_id", department) : q.neq("role", "student");
  const { data, error } = await q.order("role", { ascending: false }).order("full_name").limit(500);
  if (error) throw dbError(error, "load members");
  return toMembers(supabase, (data ?? []) as ProfileRow[]);
}

type MemberChange = {
  role?: Role;
  department_id?: string | null;
  skills?: string[];
  coverage_location_ids?: string[];
  active?: boolean;
};

/** Validates and applies a membership change to an existing profile. */
async function applyMember(supabase: Client, actor: Actor, targetId: string, change: MemberChange): Promise<Member> {
  const { data: cur, error } = await supabase.from("profiles").select(MEMBER_COLUMNS).eq("id", targetId).maybeSingle();
  if (error) throw dbError(error, "load the member");
  if (!cur) throw new PipelineError("NOT_FOUND", "No profile for that person yet. Ask them to sign in once first.");
  const before = cur as ProfileRow;

  if (before.id === actor.id) throw new PipelineError("FORBIDDEN", "You cannot change your own role here");

  const role = change.role ?? before.role;
  let department = change.department_id !== undefined ? change.department_id : before.department_id;
  // Students never belong to a fixing department; super admins see every department.
  if (role === "student" || role === "super_admin") department = null;
  // Never leave the system without an active super admin (the caller is one, but keep the rule explicit).
  if (before.role === "super_admin" && (role !== "super_admin" || change.active === false)) {
    const { count, error: cErr } = await supabase
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("role", "super_admin")
      .eq("active", true)
      .neq("id", before.id);
    if (cErr) throw dbError(cErr, "count super admins");
    if (!count) throw new PipelineError("CONFLICT", "This is the last active super admin");
  }
  if (ASSIGNABLE.includes(role) && !department) {
    throw new PipelineError("VALIDATION_ERROR", "Choose a department for field staff and department admins");
  }
  const isField = role === "field_staff";
  const skills = isField ? (change.skills ?? before.skills ?? []) : [];
  const coverage = isField ? (change.coverage_location_ids ?? before.coverage_location_ids ?? []) : [];

  if (department && department !== before.department_id) {
    const { data: d } = await supabase.from("departments").select("id").eq("id", department).maybeSingle();
    if (!d) throw new PipelineError("VALIDATION_ERROR", "Unknown department");
  }
  if (coverage.length) {
    const { data: locs, error: locErr } = await supabase.from("locations").select("id").in("id", coverage);
    if (locErr) throw dbError(locErr, "check buildings");
    if ((locs ?? []).length !== coverage.length) throw new PipelineError("VALIDATION_ERROR", "Unknown building in coverage");
  }

  // People with open jobs keep them; moving them out of the department would orphan the tickets.
  const leaving = ASSIGNABLE.includes(before.role) && (!ASSIGNABLE.includes(role) || department !== before.department_id);
  if (leaving) {
    const jobs = (await openJobs(supabase, [before.id])).get(before.id) ?? 0;
    if (jobs > 0) {
      throw new PipelineError("CONFLICT", `They still have ${jobs} open job${jobs === 1 ? "" : "s"}. Reassign them first.`);
    }
  }

  const patch: Record<string, unknown> = {};
  if (role !== before.role) patch.role = role;
  if (department !== before.department_id) patch.department_id = department;
  if (JSON.stringify(skills) !== JSON.stringify(before.skills ?? [])) patch.skills = skills;
  if (JSON.stringify(coverage) !== JSON.stringify(before.coverage_location_ids ?? [])) patch.coverage_location_ids = coverage;
  if (change.active !== undefined && change.active !== before.active) patch.active = change.active;

  let row = before;
  if (Object.keys(patch).length > 0) {
    const { data, error: upErr } = await supabase.from("profiles").update(patch).eq("id", before.id).select(MEMBER_COLUMNS).maybeSingle();
    if (upErr) throw dbError(upErr, "update the member");
    if (!data) throw new PipelineError("FORBIDDEN", "You cannot change this person");
    row = data as ProfileRow;
  }
  const [m] = await toMembers(supabase, [row]);
  return m;
}

/**
 * Gives an account a role. If nobody has signed up with that email yet, Supabase sends them an invite
 * (a sign-in link to `redirectTo`); the auth trigger creates their profile, which gets the role right away.
 */
export async function addMember(supabase: Client, actor: Actor, body: MemberAdd, redirectTo: string): Promise<Member> {
  const admin = createAdminClient();
  const email = body.email.trim().toLowerCase();
  const { data: found, error } = await admin.rpc("admin_find_user", { p_email: email });
  if (error) {
    console.error("[org] user lookup failed", error.code, error.message);
    throw new PipelineError("INTERNAL", "Could not look up that email");
  }
  let uid = typeof found === "string" && found ? found : null;
  let invited = false;
  if (!uid && emailEnabled) {
    // Resend delivers the invite (Supabase's built-in mailer allows only a few emails per hour).
    const { data: link, error: linkErr } = await admin.auth.admin.generateLink({ type: "invite", email, options: { redirectTo } });
    if (linkErr || !link.user) {
      console.error("[org] invite link failed", linkErr?.status, linkErr?.message);
      throw new PipelineError("INTERNAL", "Could not create the invite. Try again later.");
    }
    const mail = inviteEmail(link.properties.action_link, en.roles[body.role], as.roles[body.role]);
    if (!(await sendEmail(email, mail.subject, mail.html, mail.text))) {
      // The account exists now; adding the email again applies the role, and they can sign in with a magic link.
      throw new PipelineError("INTERNAL", "The account was created but the invite email could not be sent. Add them again, then ask them to sign in with this email.");
    }
    uid = link.user.id;
    invited = true;
  } else if (!uid) {
    const { data: inv, error: invErr } = await admin.auth.admin.inviteUserByEmail(email, { redirectTo });
    if (invErr || !inv.user) {
      console.error("[org] invite failed", invErr?.status, invErr?.message);
      throw new PipelineError(invErr?.status === 429 ? "RATE_LIMITED" : "INTERNAL", "Could not send the invite. Try again later.");
    }
    uid = inv.user.id;
    invited = true;
  }
  const member = await applyMember(supabase, actor, uid, {
    role: body.role,
    department_id: body.department_id ?? null,
    skills: body.skills,
    coverage_location_ids: body.coverage_location_ids,
    active: true,
  });
  return invited ? { ...member, invited } : member;
}

export async function updateMember(supabase: Client, actor: Actor, id: string, body: MemberPatch): Promise<Member> {
  return applyMember(supabase, actor, id, body);
}
