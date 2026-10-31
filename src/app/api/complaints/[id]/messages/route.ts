import type { NextRequest } from "next/server";
import { failFrom, ok, parseJson, requireUser } from "@/lib/api";
import { listMessages, postMessage } from "@/lib/assist/chat";
import { MessageRequestSchema } from "@/lib/assist/types";

// Bilingual ticket chat (S08/S15): the reporter, admins of the ticket's department and the assignee.
// Non-internal messages only; internal notes stay at /api/complaints/[id]/notes.
export async function GET(_req: NextRequest, ctx: RouteContext<"/api/complaints/[id]/messages">) {
  const { id } = await ctx.params;
  const auth = await requireUser();
  if (auth instanceof Response) return auth;
  try {
    return ok(await listMessages(auth.supabase, { id: auth.user.id, profile: auth.profile }, id));
  } catch (e) {
    return failFrom(e, "load messages");
  }
}

export async function POST(req: NextRequest, ctx: RouteContext<"/api/complaints/[id]/messages">) {
  const { id } = await ctx.params;
  const auth = await requireUser();
  if (auth instanceof Response) return auth;
  const body = await parseJson(req, MessageRequestSchema);
  if (body instanceof Response) return body;
  try {
    const r = await postMessage(auth.supabase, { id: auth.user.id, profile: auth.profile }, id, body.body);
    return ok(r.message, { status: 201 });
  } catch (e) {
    return failFrom(e, "send the message");
  }
}
