import { fail, failFrom, ok, parseJson, requireUser } from "@/lib/api";
import { hitRateLimit } from "@/lib/ratelimit";
import { ReportAgentRequestSchema, runReportAgentTurn } from "@/lib/report-agent";

/** Chat turns per user per 10 minutes. A full conversation is 1–3 turns. */
const TURNS_PER_WINDOW = 30;
const WINDOW_SECONDS = 600;

// "Tell Civi what happened": one chat turn → a follow-up question or a report draft. Never submits.
export async function POST(req: Request) {
  const auth = await requireUser();
  if (auth instanceof Response) return auth;

  const rate = await hitRateLimit(auth.supabase, "report_agent", TURNS_PER_WINDOW, WINDOW_SECONDS);
  if (!rate.ok) {
    return fail("RATE_LIMITED", "Too many messages — wait a few minutes", { headers: { "retry-after": String(rate.retryAfterSec) } });
  }

  const body = await parseJson(req, ReportAgentRequestSchema);
  if (body instanceof Response) return body;

  try {
    return ok(await runReportAgentTurn(auth.supabase, auth.user.id, body));
  } catch (e) {
    return failFrom(e, "answer");
  }
}
