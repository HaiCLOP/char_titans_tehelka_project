import type { NextRequest } from "next/server";
import { fail, ok, requireUser } from "@/lib/api";
import { PipelineError } from "@/lib/complaints";
import { supportComplaint } from "@/lib/tracking";

// "Me too" on a public ticket (idempotent). Priority bumps at 5 and 10 supporters happen in the RPC.
export async function POST(_req: NextRequest, ctx: RouteContext<"/api/complaints/[id]/support">) {
  const { id } = await ctx.params;
  const auth = await requireUser();
  if (auth instanceof Response) return auth;
  try {
    return ok(await supportComplaint(auth.supabase, { id: auth.user.id, profile: auth.profile }, id));
  } catch (e) {
    if (e instanceof PipelineError) return fail(e.code, e.message);
    console.error("[complaints] support failed", e instanceof Error ? e.message : e);
    return fail("INTERNAL", "Could not add your support");
  }
}
