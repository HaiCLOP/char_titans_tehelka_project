import { fail, parseJson, requireUser } from "@/lib/api";
import { hitRateLimit } from "@/lib/ratelimit";
import { speak, TtsRequestSchema } from "@/lib/voice";

// Text to speech for Civi's lines: returns a WAV file. Signed-in users only, to protect the free quota.
export async function POST(req: Request) {
  const auth = await requireUser();
  if (auth instanceof Response) return auth;
  const rate = await hitRateLimit(auth.supabase, "voice_tts", 60, 600);
  if (!rate.ok) return fail("RATE_LIMITED", "Too many requests. Wait a few minutes.", { headers: { "retry-after": String(rate.retryAfterSec) } });
  const body = await parseJson(req, TtsRequestSchema);
  if (body instanceof Response) return body;
  const wav = await speak(body.text);
  if (!wav) return fail("AI_UNAVAILABLE", "Speech is unavailable right now");
  return new Response(new Uint8Array(wav), { headers: { "content-type": "audio/wav", "cache-control": "private, max-age=86400" } });
}
