import { fail, failFrom, ok, parseJson, requireUser } from "@/lib/api";
import { AskRequestSchema, askCivi } from "@/lib/assist/ask";

// Ask Civi: any signed-in user asks the mascot a question about the app or campus issues.
// 20 questions per user per hour, counted per server process (enough to stop a stuck client looping).
const WINDOW_MS = 3_600_000;
const MAX_PER_WINDOW = 20;
const g = globalThis as typeof globalThis & { __askHits?: Map<string, number[]> };
const hits = (g.__askHits ??= new Map<string, number[]>());

export async function POST(req: Request) {
  const auth = await requireUser();
  if (auth instanceof Response) return auth;
  const body = await parseJson(req, AskRequestSchema);
  if (body instanceof Response) return body;

  const now = Date.now();
  const recent = (hits.get(auth.user.id) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= MAX_PER_WINDOW) return fail("RATE_LIMITED", "Too many questions. Try again later.");
  hits.set(auth.user.id, [...recent, now]);

  try {
    return ok(await askCivi(auth.supabase, auth.user.id, body.question));
  } catch (e) {
    return failFrom(e, "answer the question");
  }
}
