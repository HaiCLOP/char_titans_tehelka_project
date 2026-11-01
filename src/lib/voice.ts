import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import { engineFetch } from "@/lib/engine";
import { cacheGet, cacheSet } from "@/lib/redis";

/**
 * Speech for Civi through the Go engine (engine/internal/ai/speech.go): Gemini free tier for both
 * speech-to-text and text-to-speech, Assamese and English. Returns null when the engine or every
 * model is unavailable; the browser then falls back to its own speech features.
 */

export const MAX_AUDIO_DATA_URL = 11_000_000; // ≈ 8 MB of audio once base64-decoded
export const MAX_SPEAK_CHARS = 600;

export const SttRequestSchema = z.object({
  audio: z.string().startsWith("data:audio/").max(MAX_AUDIO_DATA_URL),
  lang: z.enum(["en", "as"]).optional(),
});
export const TtsRequestSchema = z.object({ text: z.string().trim().min(1).max(MAX_SPEAK_CHARS) });

const SttResultSchema = z.object({ text: z.string(), lang: z.enum(["en", "as"]), model: z.string(), ms: z.number() });
export type SttResult = z.infer<typeof SttResultSchema>;
const TtsResultSchema = z.object({ audio: z.string().min(1), mime: z.literal("audio/wav"), model: z.string(), ms: z.number() });

export const transcribe = (audio: string, lang?: "en" | "as") =>
  engineFetch("/v1/stt", { audio, lang }, SttResultSchema, 45_000);

const TTS_TTL_S = 7 * 86_400;
const MAX_CACHED_B64 = 900_000; // Upstash request size limit is 1 MB

/** WAV bytes for `text`. Civi's lines repeat a lot, so audio is cached in Redis for a week. */
export async function speak(text: string): Promise<Buffer | null> {
  const key = `cs:tts:v1:${createHash("sha256").update(text.trim()).digest("hex").slice(0, 32)}`;
  const hit = await cacheGet<string>(key);
  if (typeof hit === "string" && hit.length > 0) return Buffer.from(hit, "base64");
  const r = await engineFetch("/v1/tts", { text }, TtsResultSchema, 45_000);
  if (!r) return null;
  if (r.audio.length <= MAX_CACHED_B64) await cacheSet(key, r.audio, TTS_TTL_S);
  return Buffer.from(r.audio, "base64");
}
