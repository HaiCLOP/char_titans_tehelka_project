import { fail, failFrom, ok, parseJson, requireRole } from "@/lib/api";
import { AIUnavailableError } from "@/lib/ai/router";
import { askAgent } from "@/lib/agent/run";
import { AGENT_QUESTIONS_PER_HOUR, AgentRequestSchema } from "@/lib/agent/schema";
import { AgentScopeError, agentScope } from "@/lib/agent/scope";
import { hitRateLimit } from "@/lib/ratelimit";

// S16 — Ask CivicSense. Admins only; tools read with the caller's RLS client, scoped server-side.
export async function POST(req: Request) {
  const auth = await requireRole("dept_admin", "super_admin");
  if (auth instanceof Response) return auth;
  const body = await parseJson(req, AgentRequestSchema);
  if (body instanceof Response) return body;

  let scope;
  try {
    scope = agentScope(auth.profile, body.department_id);
  } catch (e) {
    if (e instanceof AgentScopeError) return fail("FORBIDDEN", e.message);
    throw e;
  }

  const rate = await hitRateLimit(auth.supabase, "agent", AGENT_QUESTIONS_PER_HOUR, 3600);
  if (!rate.ok) {
    return fail("RATE_LIMITED", `You can ask ${AGENT_QUESTIONS_PER_HOUR} questions an hour`, {
      headers: { "retry-after": String(rate.retryAfterSec) },
    });
  }

  try {
    return ok(await askAgent(auth.supabase, scope, body));
  } catch (e) {
    if (e instanceof AIUnavailableError) return fail("AI_UNAVAILABLE", "The assistant is unavailable right now");
    return failFrom(e, "answer the question");
  }
}
