import type { NextRequest } from "next/server";
import { fail, failFrom, ok } from "@/lib/api";
import { LogQuery, queryLogs, requireSysApi } from "@/lib/sys";

// S23: filterable ai_logs, newest first, keyset pages, failover chains marked.
export async function GET(req: NextRequest) {
  const auth = await requireSysApi();
  if (auth instanceof Response) return auth;
  const raw = Object.fromEntries([...req.nextUrl.searchParams.entries()].filter(([, v]) => v !== ""));
  const q = LogQuery.safeParse(raw);
  if (!q.success) return fail("VALIDATION_ERROR", q.error.issues[0]?.message ?? "Invalid filters");
  try {
    return ok(await queryLogs(q.data), { headers: { "cache-control": "no-store" } });
  } catch (e) {
    return failFrom(e, "load AI logs");
  }
}
