import { AnalyzeRequestSchema } from "@/lib/domain";
import { analyzeComplaint } from "@/lib/ai/intake";
import { fail, ok, parseJson, requireUser } from "@/lib/api";
import { hitRateLimit } from "@/lib/ratelimit";

/** 3 photos compressed to ≤ 400 KB WebP are ~1.7 MB as base64; anything far above that is not our client. */
const MAX_BODY_BYTES = 6 * 1024 * 1024;
/** AI previews per user per 10 minutes. The form only calls on meaningful changes, so this is generous. */
const PREVIEWS_PER_WINDOW = 40;
const WINDOW_SECONDS = 600;

// Live AI preview while the student is writing. Submitting the complaint is a separate route.
export async function POST(req: Request) {
  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > MAX_BODY_BYTES) return fail("VALIDATION_ERROR", "Request is too large");

  const auth = await requireUser();
  if (auth instanceof Response) return auth;

  const rate = await hitRateLimit(auth.supabase, "analyze", PREVIEWS_PER_WINDOW, WINDOW_SECONDS);
  if (!rate.ok) {
    return fail("RATE_LIMITED", "Too many previews — wait a few minutes", { headers: { "retry-after": String(rate.retryAfterSec) } });
  }

  const body = await parseJson(req, AnalyzeRequestSchema);
  if (body instanceof Response) return body;

  return ok(await analyzeComplaint(body));
}
