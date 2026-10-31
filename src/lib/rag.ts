import "server-only";
import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { CATEGORIES, STATUSES } from "@/lib/domain";
import { embedText } from "@/lib/ai/intake";
import { cacheGet, cacheSet } from "@/lib/redis";

/**
 * Retrieval for Ask CivicSense (RAG). The question is embedded with the same multilingual model as the
 * complaint summaries, so an Assamese question finds English tickets and the other way round; `rag_search`
 * (migration 17) returns the closest past tickets with how they were resolved. Runs on the caller's client,
 * so RLS keeps a department admin inside their department; sensitive reports are never retrieved.
 *
 * Upstash Redis caches the question embeddings (the slow part, one AI call) for a week, shared by every
 * server process. Without Redis everything still works, just without the cache.
 */

const EMBED_TTL_S = 7 * 86_400;
const MIN_SIMILARITY = 0.72;
const RELATIVE_WINDOW = 0.04;

export const RetrievedTicketSchema = z.object({
  code: z.string(),
  title_en: z.string().nullable(),
  title_as: z.string().nullable(),
  summary_en: z.string().nullable(),
  summary_as: z.string().nullable(),
  category: z.enum(CATEGORIES),
  status: z.enum(STATUSES),
  location_en: z.string().nullable(),
  location_as: z.string().nullable(),
  resolution_note_en: z.string().nullable(),
  resolution_note_as: z.string().nullable(),
  created_at: z.string(),
  resolved_at: z.string().nullable(),
  similarity: z.number(),
});
export type RetrievedTicket = z.infer<typeof RetrievedTicketSchema>;

const norm = (q: string) => q.trim().toLowerCase().replace(/\s+/g, " ");
const hash = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 32);

/** Question embedding, cached in Redis. null when the embedding model is unavailable. */
export async function embedQuestion(question: string): Promise<number[] | null> {
  const key = `cs:emb:v1:${hash(norm(question))}`;
  const hit = await cacheGet<number[]>(key);
  if (Array.isArray(hit) && hit.length > 0) return hit;
  const vec = await embedText(norm(question));
  if (vec) await cacheSet(key, vec, EMBED_TTL_S);
  return vec;
}

/** Past tickets closest in meaning to `question`, within `departmentId` when given. Never throws. */
export async function retrieveTickets(
  db: SupabaseClient,
  question: string,
  departmentId: string | null,
  limit = 6,
): Promise<RetrievedTicket[]> {
  const vec = await embedQuestion(question);
  if (!vec) return [];
  const { data, error } = await db.rpc("rag_search", {
    query_embedding: vec,
    dept: departmentId,
    match_count: limit,
    match_threshold: MIN_SIMILARITY,
  });
  if (error) {
    console.warn("[rag] search failed", error.code, error.message);
    return [];
  }
  const parsed = RetrievedTicketSchema.array().safeParse(data ?? []);
  if (!parsed.success) return [];
  // Short summaries all sit close together in embedding space (unrelated tickets score ~0.7–0.85), so keep
  // only the cluster around the best match. Measured on live data: right match 0.80–0.93, next 0.05+ lower.
  const best = parsed.data[0]?.similarity ?? 0;
  return parsed.data.filter((r) => r.similarity >= best - RELATIVE_WINDOW);
}
