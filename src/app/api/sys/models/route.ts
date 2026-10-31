import type { NextRequest } from "next/server";
import { z } from "zod";
import { fail, failFrom, ok, parseJson } from "@/lib/api";
import { AI_PURPOSES } from "@/lib/ai/types";
import { createAdminClient } from "@/lib/supabase/admin";
import { invalidateRouters, listChains, requireSysApi } from "@/lib/sys";

// S22: model chain per purpose (ai_providers). OpenRouter is free models only: ids ending ":free" or "auto:free".

const Id = z.uuid();
const GOOGLE_ID = /^[a-z0-9][a-z0-9.-]{2,79}$/;
const OPENROUTER_FREE_ID = /^[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._:-]*:free$/i;

const DEFAULT_CAPS: Record<string, string[]> = {
  intake: ["vision", "assamese", "json"], embed: ["embed"], dedup_verify: ["assamese", "json"], agent: ["tools", "assamese"],
  reply_draft: ["assamese"], translate_msg: ["assamese"], resolution_check: ["vision", "json"], daily_brief: ["assamese"],
};

const Create = z.object({
  purpose: z.enum(AI_PURPOSES),
  provider: z.enum(["google", "openrouter"]),
  model: z.string().trim().min(3).max(120),
}).superRefine((b, ctx) => {
  if (b.provider === "google" && !GOOGLE_ID.test(b.model)) {
    ctx.addIssue({ code: "custom", path: ["model"], message: "Gemini model ids look like gemini-flash-lite-latest" });
  }
  if (b.provider === "openrouter" && b.model !== "auto:free" && !OPENROUTER_FREE_ID.test(b.model)) {
    ctx.addIssue({ code: "custom", path: ["model"], message: "OpenRouter: free models only (id ending in :free, or auto:free)" });
  }
  if (b.purpose === "embed" && b.provider !== "google") {
    ctx.addIssue({ code: "custom", path: ["provider"], message: "Embeddings use Gemini only" });
  }
});

const Patch = z.union([
  z.object({ id: Id, enabled: z.boolean() }),
  z.object({ id: Id, move: z.enum(["up", "down"]) }),
]);

const after = async () => ok({ chains: await listChains(), ...(await invalidateRouters()) });

export async function GET() {
  const auth = await requireSysApi();
  if (auth instanceof Response) return auth;
  try {
    return ok({ chains: await listChains() }, { headers: { "cache-control": "no-store" } });
  } catch (e) {
    return failFrom(e, "load model chains");
  }
}

export async function POST(req: Request) {
  const auth = await requireSysApi();
  if (auth instanceof Response) return auth;
  const body = await parseJson(req, Create);
  if (body instanceof Response) return body;
  try {
    const db = createAdminClient();
    const { data: rows, error: readErr } = await db.from("ai_providers").select("provider, model, priority, caps").eq("purpose", body.purpose);
    if (readErr) throw new Error(readErr.message);
    if ((rows ?? []).some((r) => r.provider === body.provider && r.model === body.model)) {
      return fail("VALIDATION_ERROR", "This model is already in the chain");
    }
    const caps: string[] = rows?.[0]?.caps?.length ? rows[0].caps : DEFAULT_CAPS[body.purpose];
    const priority = Math.max(0, ...(rows ?? []).map((r) => r.priority as number)) + 10;
    const { error } = await db.from("ai_providers").insert({ ...body, caps, priority, enabled: true });
    if (error) throw new Error(error.message);
    return await after();
  } catch (e) {
    return failFrom(e, "add the model");
  }
}

export async function PATCH(req: Request) {
  const auth = await requireSysApi();
  if (auth instanceof Response) return auth;
  const body = await parseJson(req, Patch);
  if (body instanceof Response) return body;
  try {
    const db = createAdminClient();
    const { data: row } = await db.from("ai_providers").select("id, purpose").eq("id", body.id).maybeSingle();
    if (!row) return fail("NOT_FOUND", "Model not found");
    if ("enabled" in body) {
      const { error } = await db.from("ai_providers").update({ enabled: body.enabled }).eq("id", body.id);
      if (error) throw new Error(error.message);
      return await after();
    }
    // Reorder: renumber the purpose's whole chain 10, 20, 30… so equal priorities never make the order ambiguous.
    const { data: chain, error: readErr } = await db.from("ai_providers").select("id").eq("purpose", row.purpose).order("priority").order("id");
    if (readErr) throw new Error(readErr.message);
    const ids = (chain ?? []).map((r) => r.id as string);
    const i = ids.indexOf(body.id);
    const j = body.move === "up" ? i - 1 : i + 1;
    if (i < 0 || j < 0 || j >= ids.length) return fail("VALIDATION_ERROR", "Already at the edge of the chain");
    [ids[i], ids[j]] = [ids[j], ids[i]];
    const results = await Promise.all(ids.map((id, n) => db.from("ai_providers").update({ priority: (n + 1) * 10 }).eq("id", id)));
    const failed = results.find((r) => r.error);
    if (failed?.error) throw new Error(failed.error.message);
    return await after();
  } catch (e) {
    return failFrom(e, "update the model");
  }
}

export async function DELETE(req: NextRequest) {
  const auth = await requireSysApi();
  if (auth instanceof Response) return auth;
  const id = Id.safeParse(req.nextUrl.searchParams.get("id"));
  if (!id.success) return fail("VALIDATION_ERROR", "id must be a UUID");
  try {
    const { data, error } = await createAdminClient().from("ai_providers").delete().eq("id", id.data).select("id");
    if (error) throw new Error(error.message);
    if (!data?.length) return fail("NOT_FOUND", "Model not found");
    return await after();
  } catch (e) {
    return failFrom(e, "remove the model");
  }
}
