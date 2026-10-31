import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { generateText, Output } from "ai";
import { PipelineError } from "@/lib/complaints";
import { AIUnavailableError, runAI } from "@/lib/ai/router";
import { createAdminClient } from "@/lib/supabase/admin";
import { sniffImage } from "@/lib/image-sniff";
import { loadTicketForManager, withAssameseGuard, type Actor, type AssistTicket } from "./access";
import { resolutionCheckSystem } from "./prompts";
import {
  ResolutionCheckSchema, ResolutionVerdictSchema, type ResolutionCheck, type ResolutionCheckState,
} from "./types";

/*
 * Resolution photo check (S15, PRD 9 `resolution_check`). Advisory only: it never changes the status.
 * BEFORE = first complaint photo (complaint-photos), AFTER = resolution_photo_url (resolution-photos).
 * Photos are private; they are downloaded with the service role only after the manager check.
 */

const PHOTO_BUCKET = "complaint-photos";
const RESOLUTION_BUCKET = "resolution-photos";
const MAX_BYTES = 6 * 1024 * 1024;

const beforePath = (t: AssistTicket) => t.image_urls?.find((p) => p && !/^https?:/i.test(p)) ?? null;
const afterPath = (t: AssistTicket) =>
  t.resolution_photo_url && !/^https?:/i.test(t.resolution_photo_url) ? t.resolution_photo_url : null;

function storedResult(t: AssistTicket): ResolutionCheck | null {
  const parsed = ResolutionCheckSchema.safeParse((t.ai_meta ?? {})["resolution_check"]);
  return parsed.success ? parsed.data : null;
}

export async function getResolutionCheck(supabase: SupabaseClient, actor: Actor, idOrCode: string): Promise<ResolutionCheckState> {
  const t = await loadTicketForManager(supabase, actor, idOrCode);
  return { result: storedResult(t), has_before: Boolean(beforePath(t)), has_after: Boolean(afterPath(t)) };
}

async function download(bucket: string, path: string): Promise<{ data: Uint8Array; mediaType: string }> {
  const { data, error } = await createAdminClient().storage.from(bucket).download(path);
  if (error || !data) {
    console.error("[resolution-check] download failed", bucket, error?.message);
    throw new PipelineError("NOT_FOUND", "A photo could not be loaded");
  }
  const bytes = new Uint8Array(await data.arrayBuffer());
  if (bytes.byteLength > MAX_BYTES) throw new PipelineError("VALIDATION_ERROR", "A photo is too large to check");
  const mediaType = sniffImage(bytes);
  if (!mediaType) throw new PipelineError("VALIDATION_ERROR", "A photo is not a supported image");
  return { data: bytes, mediaType };
}

export async function checkResolution(supabase: SupabaseClient, actor: Actor, idOrCode: string): Promise<ResolutionCheck> {
  const started = Date.now();
  const t = await loadTicketForManager(supabase, actor, idOrCode);
  const before = beforePath(t);
  const after = afterPath(t);
  if (!before) throw new PipelineError("VALIDATION_ERROR", "No before photo: the reporter did not attach one");
  if (!after) throw new PipelineError("VALIDATION_ERROR", "No after photo yet: it is added when the ticket is marked resolved");

  const [b, a] = await Promise.all([download(PHOTO_BUCKET, before), download(RESOLUTION_BUCKET, after)]);
  const context = `Reported problem: ${t.title_en || t.title_as || t.category}. ${t.summary_en ?? ""}`.trim();
  const ask = (strict: boolean) =>
    runAI(
      "resolution_check",
      async ({ languageModel, abortSignal }) => {
        const { output } = await generateText({
          model: languageModel(),
          system: resolutionCheckSystem(strict),
          messages: [
            {
              role: "user",
              content: [
                { type: "text", text: `${context}\nImage 1 = BEFORE, image 2 = AFTER.` },
                { type: "image", image: b.data, mediaType: b.mediaType },
                { type: "image", image: a.data, mediaType: a.mediaType },
              ],
            },
          ],
          output: Output.object({ schema: ResolutionVerdictSchema }),
          abortSignal,
        });
        return output;
      },
      { requireCaps: ["vision"] },
    );

  let r;
  try {
    r = await withAssameseGuard(
      true,
      ask,
      (x) => x.result.reason_as,
      (x, replace) => ({ ...x, result: { ...x.result, reason_as: replace(x.result.reason_as) } }),
    );
  } catch (e) {
    if (e instanceof AIUnavailableError) throw new PipelineError("AI_UNAVAILABLE", "The AI could not check the photos right now");
    throw e;
  }

  const result: ResolutionCheck = { ...r.result, checked_at: new Date().toISOString(), model: r.model, ms: Date.now() - started };
  // Merge one key into ai_meta with the service role (caller already verified as a manager of this ticket).
  const db = createAdminClient();
  const { data: cur } = await db.from("complaints").select("ai_meta").eq("id", t.id).maybeSingle();
  const meta = { ...(((cur as { ai_meta?: Record<string, unknown> } | null)?.ai_meta) ?? {}), resolution_check: result };
  const { error } = await db.from("complaints").update({ ai_meta: meta }).eq("id", t.id);
  if (error) console.warn("[resolution-check] save failed", error.code, error.message);
  return result;
}
