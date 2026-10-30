import type { NextRequest } from "next/server";
import { InternalNoteRequestSchema } from "@/lib/domain";
import { failFrom, ok, parseJson, requireUser } from "@/lib/api";
import { addInternalNote, listInternalNotes } from "@/lib/admin";

// Internal notes (messages.internal = true): admins of the ticket and the assignee. Never shown to reporters.
export async function GET(_req: NextRequest, ctx: RouteContext<"/api/complaints/[id]/notes">) {
  const { id } = await ctx.params;
  const auth = await requireUser();
  if (auth instanceof Response) return auth;
  try {
    return ok(await listInternalNotes(auth.supabase, { id: auth.user.id, profile: auth.profile }, id));
  } catch (e) {
    return failFrom(e, "load notes");
  }
}

export async function POST(req: NextRequest, ctx: RouteContext<"/api/complaints/[id]/notes">) {
  const { id } = await ctx.params;
  const auth = await requireUser();
  if (auth instanceof Response) return auth;
  const body = await parseJson(req, InternalNoteRequestSchema);
  if (body instanceof Response) return body;
  try {
    return ok(await addInternalNote(auth.supabase, { id: auth.user.id, profile: auth.profile }, id, body.body), { status: 201 });
  } catch (e) {
    return failFrom(e, "add the note");
  }
}
