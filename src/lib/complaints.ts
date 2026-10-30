import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import {
  COMPLAINTS_PER_HOUR,
  SimilarItemSchema,
  STATUSES,
  type ErrorCode,
  type Intake,
  type Profile,
  type SimilarItem,
  type Status,
  type SubmitResult,
} from "@/lib/domain";
import { analyzeComplaint, embedText, type IntakeResult } from "@/lib/ai/intake";
import { fallbackIntake } from "@/lib/ai/fallback";
import { INTAKE_PROMPT_VERSION } from "@/lib/ai/prompts/intake";
import { engineFetch } from "@/lib/engine";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAssameseText } from "@/lib/utils";

/** Safe auto-routing threshold (PRD rule 1). */
export const AUTO_ROUTE_CONFIDENCE = 0.75;
const DEDUP_THRESHOLD = 0.8;
const BUCKET = "complaint-photos";

export class PipelineError extends Error {
  constructor(public code: ErrorCode, message: string) {
    super(message);
  }
}

// ---------- duplicate search ----------

const MatchSchema = z.array(SimilarItemSchema.extend({ location_id: z.string().nullable().optional() }));

/**
 * Cross-lingual duplicate candidates. match_complaints is SECURITY DEFINER and returns private tickets
 * too, so results are filtered to rows the public view exposes (public, not sensitive, not merged).
 * Returns null when no embedding could be produced (AI down).
 */
export async function findSimilar(
  supabase: SupabaseClient,
  input: { summary_en: string; location_id?: string | null },
): Promise<SimilarItem[] | null> {
  let matches = await engineFetch(
    "/v1/similar",
    { summary_en: input.summary_en, location_id: input.location_id ?? null, threshold: DEDUP_THRESHOLD },
    MatchSchema,
  );
  if (!matches) {
    const vec = await embedText(input.summary_en);
    if (!vec) return null;
    const { data, error } = await supabase.rpc("match_complaints", {
      query_embedding: vec,
      match_threshold: DEDUP_THRESHOLD,
      match_count: 3,
      filter_location: input.location_id ?? null,
    });
    if (error) throw new PipelineError("INTERNAL", "Similarity search failed");
    const parsed = MatchSchema.safeParse(data ?? []);
    if (!parsed.success) throw new PipelineError("INTERNAL", "Similarity search failed");
    matches = parsed.data;
  }
  if (matches.length === 0) return [];

  const { data: visible, error } = await supabase
    .from("complaints_public")
    .select("id")
    .in("id", matches.map((m) => m.id));
  if (error) throw new PipelineError("INTERNAL", "Similarity search failed");
  const allowed = new Set((visible ?? []).map((r: { id: string }) => r.id));
  return matches
    .filter((m) => allowed.has(m.id))
    .map(({ id, code, title_en, title_as, status, metoo_count, similarity }) => ({
      id, code, title_en, title_as, status, metoo_count, similarity,
    }));
}

// ---------- submit pipeline ----------

export type SubmitInput = {
  text: string;
  image_paths: string[];
  location_id?: string | null;
  location_note?: string | null;
  visibility: "public" | "private";
  anonymous: boolean;
  is_sensitive: boolean;
  intake?: Intake;
  intake_source?: "ai" | "fallback";
  intake_model?: string;
};

type Department = { id: string; name_en: string; name_as: string };

/** Downloads the reporter's own photos (storage RLS: folder = uid) as data URLs for multimodal intake. */
async function loadImages(supabase: SupabaseClient, paths: string[]): Promise<string[]> {
  const out = await Promise.all(
    paths.map(async (p) => {
      const { data, error } = await supabase.storage.from(BUCKET).download(p);
      if (error || !data) return null;
      const mime = data.type?.startsWith("image/")
        ? data.type
        : p.endsWith(".png") ? "image/png" : p.endsWith(".webp") ? "image/webp" : "image/jpeg";
      return `data:${mime};base64,${Buffer.from(await data.arrayBuffer()).toString("base64")}`;
    }),
  );
  return out.filter((u): u is string => u !== null);
}

/**
 * Validate → rate limit → intake (if not passed) → embed ∥ route → decide status → insert (user client)
 * → embedding + ai_meta (admin client). Never fails because AI is down: falls back to keyword intake.
 */
export async function submitComplaint(
  supabase: SupabaseClient,
  user: { id: string },
  profile: Profile,
  input: SubmitInput,
): Promise<SubmitResult> {
  // Photo paths must be the caller's own uploads (storage RLS also enforces this on upload).
  if (input.image_paths.some((p) => !p.startsWith(`${user.id}/`))) {
    throw new PipelineError("VALIDATION_ERROR", "Photos must be your own uploads");
  }

  const [{ data: allowed, error: rlError }, location] = await Promise.all([
    supabase.rpc("check_rate_limit", { max_per_hour: COMPLAINTS_PER_HOUR }),
    input.location_id
      ? supabase.from("locations").select("id, name_en").eq("id", input.location_id).maybeSingle()
      : Promise.resolve(null),
  ]);
  if (rlError) throw new PipelineError("INTERNAL", "Could not check rate limit");
  if (allowed === false) {
    throw new PipelineError("RATE_LIMITED", `You can submit up to ${COMPLAINTS_PER_HOUR} complaints per hour`);
  }
  if (input.location_id && !location?.data) throw new PipelineError("VALIDATION_ERROR", "Unknown location");
  const locationName = (location?.data as { name_en: string } | null)?.name_en;

  // ---- intake ----
  let intake: Intake;
  let meta: Record<string, unknown>;
  let source: "ai" | "fallback";
  if (input.intake) {
    // Preview from /api/ai/analyze, possibly edited by the reporter. The safety flags come from the
    // client, so OR them with the deterministic keyword detector to keep the auto-route rule honest.
    const kw = fallbackIntake(input.text);
    source = input.intake_source ?? "ai";
    intake = {
      ...input.intake,
      is_urgent: input.intake.is_urgent || kw.is_urgent,
      is_sensitive_suggested: input.intake.is_sensitive_suggested || kw.is_sensitive_suggested,
    };
    meta = { source, via: "preview", model: input.intake_model ?? null, edited_preview: true };
  } else {
    const images = input.image_paths.length ? await loadImages(supabase, input.image_paths) : [];
    const r: IntakeResult = await analyzeComplaint({ text: input.text, images, locationName });
    intake = r.intake;
    source = r.source;
    meta = {
      source: r.source,
      via: r.via,
      model: r.model ?? null,
      ms: r.ms,
      attempts: {
        count: r.attempts.length,
        failed: r.attempts.filter((a) => a.status !== "ok").length,
        chain: r.attempts.map((a) => `${a.provider}/${a.model}:${a.status}`).slice(0, 10),
      },
    };
  }
  if (intake.is_urgent) intake = { ...intake, priority: 1 };

  // ---- embed ∥ route ----
  const [embedding, deptRes] = await Promise.all([
    source === "ai" ? embedText(intake.summary_en) : Promise.resolve(null),
    supabase
      .from("departments")
      .select("id, name_en, name_as")
      .contains("categories", [intake.category])
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle(),
  ]);
  const department = (deptRes.data as Department | null) ?? null;

  // ---- status (PRD rule 1: safe auto-routing only) ----
  const sensitive = input.is_sensitive || intake.is_sensitive_suggested;
  const autoRoute =
    source === "ai" &&
    department !== null &&
    intake.confidence >= AUTO_ROUTE_CONFIDENCE &&
    !sensitive &&
    !intake.is_urgent &&
    !intake.is_abusive;
  const status: Status = autoRoute ? "triaged" : "needs_review";

  const originalLang = isAssameseText(input.text) ? "as" : input.text.trim() ? "en" : profile.lang_pref;

  const { data: row, error: insErr } = await supabase
    .from("complaints")
    .insert({
      user_id: user.id,
      anonymous: input.anonymous,
      original_text: input.text,
      original_lang: originalLang,
      title_en: intake.title_en,
      title_as: intake.title_as,
      summary_en: intake.summary_en,
      summary_as: intake.summary_as,
      category: intake.category,
      priority: intake.priority,
      status,
      location_id: input.location_id ?? null,
      location_note: input.location_note || null,
      department_id: department?.id ?? null,
      image_urls: input.image_paths,
      ai_status: source === "ai" ? "done" : "fallback",
      visibility: input.is_sensitive ? "private" : input.visibility, // sensitive ⇒ private (DB constraint too)
      is_sensitive: input.is_sensitive,
      is_urgent: intake.is_urgent,
    })
    .select("id, code, sla_due_at, status, is_urgent")
    .single();
  if (insErr || !row) {
    console.error("[complaints] insert failed", insErr?.code, insErr?.message);
    throw new PipelineError("INTERNAL", "Could not save the complaint");
  }

  // ---- embedding + ai_meta (service role; best effort — heal_pending_ai fills gaps later) ----
  const aiMeta = {
    ...meta,
    prompt_version: INTAKE_PROMPT_VERSION,
    confidence: intake.confidence,
    priority_reason_en: intake.priority_reason_en,
    location_hint: intake.location_hint,
    is_abusive: intake.is_abusive,
    has_personal_data: intake.has_personal_data,
    is_sensitive_suggested: intake.is_sensitive_suggested,
    auto_routed: autoRoute,
  };
  const { error: metaErr } = await createAdminClient()
    .from("complaints")
    .update(embedding ? { ai_meta: aiMeta, embedding } : { ai_meta: aiMeta })
    .eq("id", row.id);
  if (metaErr) console.warn("[complaints] ai_meta/embedding update failed", metaErr.code);

  const statusOut = z.enum(STATUSES).parse(row.status);
  return {
    id: row.id as string,
    code: row.code as string,
    department,
    sla_due_at: (row.sla_due_at as string | null) ?? null,
    status: statusOut,
    is_urgent: Boolean(row.is_urgent),
  };
}
