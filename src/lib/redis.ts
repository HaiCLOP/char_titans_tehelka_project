import "server-only";

/**
 * Minimal Upstash Redis client over the REST API (no SDK). Used as a shared cache: the web app and any other
 * process see the same entries, unlike the in-memory maps. Every call is best effort — if Redis is not
 * configured, slow or down, reads return null and writes are skipped, so callers just recompute.
 */

const URL_ = process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const TIMEOUT_MS = 800;

export const redisEnabled = Boolean(URL_ && TOKEN);

async function command<T>(args: (string | number)[]): Promise<T | null> {
  if (!URL_ || !TOKEN) return null;
  try {
    const res = await fetch(URL_, {
      method: "POST",
      headers: { authorization: `Bearer ${TOKEN}`, "content-type": "application/json" },
      body: JSON.stringify(args),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { result?: T; error?: string };
    return body.error ? null : (body.result ?? null);
  } catch {
    return null;
  }
}

/** JSON value or null (missing, expired, unparsable or Redis unavailable). */
export async function cacheGet<T>(key: string): Promise<T | null> {
  const raw = await command<string>(["GET", key]);
  if (raw == null) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function cacheSet(key: string, value: unknown, ttlSeconds: number): Promise<void> {
  await command(["SET", key, JSON.stringify(value), "EX", Math.max(1, Math.round(ttlSeconds))]);
}

/** Drops every key with this prefix (small keyspace; SCAN is fine). */
export async function cacheDropPrefix(prefix: string): Promise<void> {
  let cursor = "0";
  for (let i = 0; i < 20; i++) {
    const r = await command<[string, string[]]>(["SCAN", cursor, "MATCH", `${prefix}*`, "COUNT", 200]);
    if (!r) return;
    const [next, keys] = r;
    if (keys.length) await command(["DEL", ...keys]);
    if (next === "0") return;
    cursor = next;
  }
}
