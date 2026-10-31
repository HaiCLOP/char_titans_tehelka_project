import { z } from "zod";
import { failFrom, ok, parseJson } from "@/lib/api";
import { runPurposeTest } from "@/lib/ai/sys-test";
import { AI_PURPOSES } from "@/lib/ai/types";
import { requireSysApi } from "@/lib/sys";

const Body = z.object({ purpose: z.enum(AI_PURPOSES) });

// S22: run the purpose's bilingual test prompt through the real router → {ok, output, attempts, ms}.
export async function POST(req: Request) {
  const auth = await requireSysApi();
  if (auth instanceof Response) return auth;
  const body = await parseJson(req, Body);
  if (body instanceof Response) return body;
  try {
    return ok(await runPurposeTest(body.purpose));
  } catch (e) {
    return failFrom(e, "run the test prompt");
  }
}
