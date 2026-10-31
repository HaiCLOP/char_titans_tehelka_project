import { failFrom, ok } from "@/lib/api";
import { testAllKeys } from "@/lib/ai/sys-test";
import { requireSysApi } from "@/lib/sys";

// S21 "Test all": one cheap call per enabled key (simulated keys report rate_limited, no network call).
export async function POST() {
  const auth = await requireSysApi();
  if (auth instanceof Response) return auth;
  try {
    return ok({ results: await testAllKeys() });
  } catch (e) {
    return failFrom(e, "test keys");
  }
}
