import type { NextRequest } from "next/server";
import { LinkRequestSchema } from "@/lib/domain";
import { failFrom, ok, parseJson, requireRole } from "@/lib/api";
import { linkComplaint } from "@/lib/admin";

// Link as duplicate ({parent_id}) or unlink ({unlink: true}). Admins of the ticket only.
export async function POST(req: NextRequest, ctx: RouteContext<"/api/complaints/[id]/link">) {
  const { id } = await ctx.params;
  const auth = await requireRole("dept_admin", "super_admin");
  if (auth instanceof Response) return auth;
  const body = await parseJson(req, LinkRequestSchema);
  if (body instanceof Response) return body;
  try {
    return ok(await linkComplaint(auth.supabase, { id: auth.user.id, profile: auth.profile }, id, body));
  } catch (e) {
    return failFrom(e, "link the complaint");
  }
}
