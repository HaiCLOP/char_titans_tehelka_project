import { failFrom, ok } from "@/lib/api";
import { getSysHealth, requireSysApi } from "@/lib/sys";

// S20: per model×purpose success/latency (last 100 calls), per key state, engine status.
export async function GET() {
  const auth = await requireSysApi();
  if (auth instanceof Response) return auth;
  try {
    return ok(await getSysHealth(), { headers: { "cache-control": "no-store" } });
  } catch (e) {
    return failFrom(e, "load system health");
  }
}
