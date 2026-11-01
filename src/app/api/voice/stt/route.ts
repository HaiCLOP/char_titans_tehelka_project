import { fail, ok, parseJson, requireUser } from "@/lib/api";
import { hitRateLimit } from "@/lib/ratelimit";
import { SttRequestSchema, transcribe } from "@/lib/voice";

// Speech to text for the voice report and Civi chat: a recorded clip (data URL) → transcript.
export async function POST(req: Request) {
  const auth = await requireUser();
  if (auth instanceof Response) return auth;
  const rate = await hitRateLimit(auth.supabase, "voice_stt", 40, 600);
  if (!rate.ok) return fail("RATE_LIMITED", "Too many recordings. Wait a few minutes.", { headers: { "retry-after": String(rate.retryAfterSec) } });
  const body = await parseJson(req, SttRequestSchema);
  if (body instanceof Response) return body;
  const r = await transcribe(body.audio, body.lang);
  if (!r) return fail("AI_UNAVAILABLE", "Speech recognition is unavailable right now");
  return ok({ text: r.text, lang: r.lang });
}
