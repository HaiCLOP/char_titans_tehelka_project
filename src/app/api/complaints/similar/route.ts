import { SimilarRequestSchema } from "@/lib/domain";
import { fail, ok, parseJson, requireUser } from "@/lib/api";
import { findSimilar, PipelineError } from "@/lib/complaints";

// Duplicate suggestions for the report screen (S05). Public, non-sensitive tickets only.
export async function POST(req: Request) {
  const auth = await requireUser();
  if (auth instanceof Response) return auth;
  const body = await parseJson(req, SimilarRequestSchema);
  if (body instanceof Response) return body;

  try {
    const items = await findSimilar(auth.supabase, body);
    if (items === null) return fail("AI_UNAVAILABLE", "Duplicate search is unavailable right now");
    return ok(items);
  } catch (e) {
    if (e instanceof PipelineError) return fail(e.code, e.message);
    throw e;
  }
}
