import { AnalyzeRequestSchema } from "@/lib/domain";
import { analyzeComplaint } from "@/lib/ai/intake";
import { ok, parseJson, requireUser } from "@/lib/api";

// Live AI preview while the student is writing. Submitting the complaint is a separate route.
export async function POST(req: Request) {
  const auth = await requireUser();
  if (auth instanceof Response) return auth;
  const body = await parseJson(req, AnalyzeRequestSchema);
  if (body instanceof Response) return body;

  return ok(await analyzeComplaint(body));
}
