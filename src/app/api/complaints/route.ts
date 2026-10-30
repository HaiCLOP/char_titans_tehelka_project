import type { NextRequest } from "next/server";
import { ComplaintListQuerySchema, SubmitComplaintSchema, type Role } from "@/lib/domain";
import { fail, ok, parseJson, requireUser } from "@/lib/api";
import { PipelineError, submitComplaint } from "@/lib/complaints";
import { listComplaints } from "@/lib/tracking";
import { createClient } from "@/lib/supabase/server";

const SCOPE_ROLES: Record<"dept" | "assigned", Role[]> = {
  dept: ["dept_admin", "super_admin"],
  assigned: ["field_staff", "dept_admin", "super_admin"],
};

// List complaints by scope (PRD section 10). `public` works signed-out (home page, S01) through the
// complaints_public view; every other scope needs a signed-in user.
export async function GET(req: NextRequest) {
  const parsed = ComplaintListQuerySchema.safeParse(Object.fromEntries(req.nextUrl.searchParams));
  if (!parsed.success) return fail("VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Invalid query");
  const q = parsed.data;

  try {
    if (q.scope === "public") {
      const supabase = await createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return ok(await listComplaints(supabase, null, q));
    }
    const auth = await requireUser();
    if (auth instanceof Response) return auth;
    if ((q.scope === "dept" || q.scope === "assigned") && !SCOPE_ROLES[q.scope].includes(auth.profile.role)) {
      return fail("FORBIDDEN", "Not allowed for your role");
    }
    return ok(await listComplaints(auth.supabase, { id: auth.user.id, profile: auth.profile }, q));
  } catch (e) {
    if (e instanceof PipelineError) return fail(e.code, e.message);
    console.error("[complaints] list failed", e instanceof Error ? e.message : e);
    return fail("INTERNAL", "Could not load complaints");
  }
}

// Submit a complaint (PRD section 10 "Submit pipeline"). Works even when every AI model is down.
export async function POST(req: Request) {
  const auth = await requireUser();
  if (auth instanceof Response) return auth;
  const body = await parseJson(req, SubmitComplaintSchema);
  if (body instanceof Response) return body;

  try {
    return ok(await submitComplaint(auth.supabase, auth.user, auth.profile, body), { status: 201 });
  } catch (e) {
    if (e instanceof PipelineError) return fail(e.code, e.message);
    console.error("[complaints] submit failed", e instanceof Error ? e.message : e);
    return fail("INTERNAL", "Could not submit the complaint");
  }
}
