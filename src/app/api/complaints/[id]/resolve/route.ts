import type { NextRequest } from "next/server";
import { ResolveRequestSchema } from "@/lib/domain";
import { failFrom, ok, parseJson, requireUser } from "@/lib/api";
import { resolveComplaint } from "@/lib/admin";

// Mark resolved with a note (+ after photo from /api/upload/resolution; required for field staff).
export async function POST(req: NextRequest, ctx: RouteContext<"/api/complaints/[id]/resolve">) {
  const { id } = await ctx.params;
  const auth = await requireUser();
  if (auth instanceof Response) return auth;
  const body = await parseJson(req, ResolveRequestSchema);
  if (body instanceof Response) return body;
  try {
    return ok(await resolveComplaint(auth.supabase, { id: auth.user.id, profile: auth.profile }, id, body));
  } catch (e) {
    return failFrom(e, "resolve the complaint");
  }
}
