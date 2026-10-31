import type { NextRequest } from "next/server";
import { z } from "zod";
import { fail, failFrom, ok, parseJson } from "@/lib/api";
import { encryptKey } from "@/lib/ai/crypto";
import { resetKeyState } from "@/lib/ai/router";
import { createAdminClient } from "@/lib/supabase/admin";
import { invalidateRouters, listKeys, requireSysApi } from "@/lib/sys";
import { audit } from "@/lib/audit";

// S21: AI keys. Keys are stored AES-256-GCM encrypted and never returned (last 4 only).
// Env keys (GEMINI_API_KEYS / OPENROUTER_API_KEYS) are listed read-only with source "env".

const Id = z.uuid();
const Label = z.string().trim().min(2).max(40).regex(/^[A-Za-z0-9 ._-]+$/, "Label: letters, digits, space . _ - only")
  .refine((s) => !s.toLowerCase().startsWith("env-"), "Labels starting with env- are reserved");
const Rpm = z.number().int().min(1).max(1000);

const Create = z.object({
  provider: z.enum(["google", "openrouter"]),
  label: Label,
  key: z.string().trim().min(20, "Key looks too short").max(512).regex(/^\S+$/, "Key must not contain spaces"),
  rpm_limit: Rpm.default(10),
});
const Patch = z.object({
  id: Id,
  enabled: z.boolean().optional(),
  simulate_failure: z.boolean().optional(),
  rpm_limit: Rpm.optional(),
  label: Label.optional(),
}).refine((b) => Object.keys(b).length > 1, "Nothing to change");

const COLUMNS = "id, provider, label, key_last4, enabled, rpm_limit, simulate_failure";

export async function GET() {
  const auth = await requireSysApi();
  if (auth instanceof Response) return auth;
  try {
    return ok(await listKeys(), { headers: { "cache-control": "no-store" } });
  } catch (e) {
    return failFrom(e, "load keys");
  }
}

export async function POST(req: Request) {
  const auth = await requireSysApi();
  if (auth instanceof Response) return auth;
  const body = await parseJson(req, Create);
  if (body instanceof Response) return body;
  try {
    const db = createAdminClient();
    const { data: dupe } = await db.from("ai_keys").select("id").eq("label", body.label).maybeSingle();
    if (dupe) return fail("VALIDATION_ERROR", "A key with this label already exists");
    const { data, error } = await db.from("ai_keys").insert({
      provider: body.provider, label: body.label, rpm_limit: body.rpm_limit,
      key_encrypted: encryptKey(body.key), key_last4: body.key.slice(-4),
    }).select(COLUMNS).single();
    if (error) throw new Error(error.message);
    await audit(auth.user.id, "key.create", `ai_keys:${data.id}`, { label: body.label, provider: body.provider, rpm_limit: body.rpm_limit });
    return ok({ key: data, ...(await invalidateRouters()) }, { status: 201 });
  } catch (e) {
    return failFrom(e, "add the key");
  }
}

export async function PATCH(req: Request) {
  const auth = await requireSysApi();
  if (auth instanceof Response) return auth;
  const body = await parseJson(req, Patch);
  if (body instanceof Response) return body;
  const { id, ...changes } = body;
  try {
    const db = createAdminClient();
    if (changes.label) {
      const { data: dupe } = await db.from("ai_keys").select("id").eq("label", changes.label).neq("id", id).maybeSingle();
      if (dupe) return fail("VALIDATION_ERROR", "A key with this label already exists");
    }
    const { data: before } = await db.from("ai_keys").select("label").eq("id", id).maybeSingle();
    if (!before) return fail("NOT_FOUND", "Key not found");
    const { data, error } = await db.from("ai_keys").update(changes).eq("id", id).select(COLUMNS).single();
    if (error) throw new Error(error.message);
    // Leaving a failover test or re-enabling a key: drop its local cooldown so it is used again at once.
    if (changes.simulate_failure === false || changes.enabled === true) resetKeyState(before.label as string);
    await audit(auth.user.id, "key.update", `ai_keys:${id}`, { label: before.label, changes });
    return ok({ key: data, ...(await invalidateRouters()) });
  } catch (e) {
    return failFrom(e, "update the key");
  }
}

export async function DELETE(req: NextRequest) {
  const auth = await requireSysApi();
  if (auth instanceof Response) return auth;
  const id = Id.safeParse(req.nextUrl.searchParams.get("id"));
  if (!id.success) return fail("VALIDATION_ERROR", "id must be a UUID");
  try {
    const { data, error } = await createAdminClient().from("ai_keys").delete().eq("id", id.data).select("id");
    if (error) throw new Error(error.message);
    if (!data?.length) return fail("NOT_FOUND", "Key not found");
    await audit(auth.user.id, "key.delete", `ai_keys:${id.data}`);
    return ok({ deleted: id.data, ...(await invalidateRouters()) });
  } catch (e) {
    return failFrom(e, "delete the key");
  }
}
