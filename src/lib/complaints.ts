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
import { INTAKE_PROMPT_VERSION } from "@/lib/ai/prompts/intake";
import { autoAssign } from "@/lib/assign";
import { engineFetch } from "@/lib/engine";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAssameseText } from "@/lib/utils";
import { filterAbusiveText } from "@/lib/moderation";
import { buildCivicShieldReport } from "@/lib/civicshield";

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

type LoadedImage = { path: string; dataUrl: string; bytes: Uint8Array };

/** Downloads the reporter's own photos (storage RLS: folder = uid) for vision intake and CivicShield inspection. */
async function loadRawImages(supabase: SupabaseClient, paths: string[]): Promise<LoadedImage[]> {
  const list: LoadedImage[] = [];
  for (const p of paths) {
    const { data, error } = await supabase.storage.from(BUCKET).download(p);
    if (error || !data) continue;
    const arrayBuf = await data.arrayBuffer();
    const bytes = new Uint8Array(arrayBuf);
    const mime = data.type?.startsWith("image/")
      ? data.type
      : p.endsWith(".png") ? "image/png" : p.endsWith(".webp") ? "image/webp" : "image/jpeg";
    const dataUrl = `data:${mime};base64,${Buffer.from(bytes).toString("base64")}`;
    list.push({ path: p, dataUrl, bytes });
  }
  return list;
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
  // Automatically filter and mask abusive words from input text
  const { cleanText, hasAbuse } = filterAbusiveText(input.text);
  input.text = cleanText;

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

  // ---- intake (Item 1: Never trust AI analysis from frontend; verify on backend) ----
  const rawImages = input.image_paths.length ? await loadRawImages(supabase, input.image_paths) : [];
  const imageUrls = rawImages.map((r) => r.dataUrl);

  const r: IntakeResult = await analyzeComplaint({ text: input.text, images: imageUrls, locationName });
  let intake: Intake = r.intake;
  const source: "ai" | "fallback" = r.source;

  // CivicShield evidence verification (authenticity, C2PA, SynthID, and SHA-256 hash preservation)
  const civicshield = buildCivicShieldReport(
    rawImages.map((img) => ({ path: img.path, bytes: img.bytes })),
    intake,
  );

  const meta: Record<string, unknown> = {
    source: r.source,
    via: r.via,
    model: r.model ?? null,
    ms: r.ms,
    attempts: {
      count: r.attempts.length,
      failed: r.attempts.filter((a) => a.status !== "ok").length,
      chain: r.attempts.map((a) => `${a.provider}/${a.model}:${a.status}`).slice(0, 10),
    },
    civicshield,
  };

  // If user provided custom category override and it's valid, record user hint but verify
  if (input.intake?.category && input.intake.category !== intake.category) {
    meta.user_category_hint = input.intake.category;
  }

  if (intake.is_urgent) intake = { ...intake, priority: 1 };

  if (intake.is_relevant === false) {
    throw new PipelineError("VALIDATION_ERROR", intake.rejection_reason_en || "Only genuine campus civic, facility, or safety issues can be submitted");
  }
  if (intake.has_abusive_image || intake.has_explicit_image) {
    throw new PipelineError("VALIDATION_ERROR", intake.image_rejection_reason_en || "Abusive, offensive, or explicit images are strictly prohibited");
  }
  if (intake.has_ai_image || civicshield.status === "ai_detected") {
    throw new PipelineError("VALIDATION_ERROR", intake.image_rejection_reason_en || "Stock photos, internet images (OSINT), and AI-generated pictures are strictly prohibited. Please capture an authentic campus photo directly.");
  }
  if (intake.is_abusive && (hasAbuse || !intake.is_relevant)) {
    throw new PipelineError("VALIDATION_ERROR", intake.abusive_reason_en || "Abusive language or personal attacks are strictly prohibited");
  }

  // Item 3: Sensitive complaints must automatically become private
  const sensitive = input.is_sensitive || intake.is_sensitive_suggested || intake.is_abusive;
  if (sensitive) {
    input.is_sensitive = true;
    input.visibility = "private";
  }

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

  let statusOut = z.enum(STATUSES).parse(row.status);

  // ---- auto-assign (same safety rule as auto-routing; best effort, never fails the submit) ----
  // auto_assign_complaint re-checks the rule from the stored row + ai_meta, so it needs ai_meta first.
  let assignee: { id: string; name: string | null } | null = null;
  if (statusOut === "triaged" && autoRoute && !metaErr) {
    assignee = await autoAssign(row.id as string);
    if (assignee) statusOut = "assigned";
  }

  return {
    id: row.id as string,
    code: row.code as string,
    department,
    sla_due_at: (row.sla_due_at as string | null) ?? null,
    status: statusOut,
    is_urgent: Boolean(row.is_urgent),
    assignee,
  };
}
