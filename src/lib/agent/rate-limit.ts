/**
 * Sliding-window limiter for agent questions (PRD 13: 30 per hour per user).
 * In-memory per server instance (kept on globalThis so dev hot reloads don't reset it). On a
 * multi-instance deployment each instance counts separately — acceptable for the hackathon deployment.
 */
export type RateResult = { ok: true; remaining: number } | { ok: false; retryAfterSec: number };

export function createRateLimiter(limit: number, windowMs: number, now: () => number = Date.now) {
  const hits = new Map<string, number[]>();
  return {
    /** Records one hit for `key` if it is under the limit. */
    take(key: string): RateResult {
      const t = now();
      const recent = (hits.get(key) ?? []).filter((x) => t - x < windowMs);
      if (recent.length >= limit) {
        hits.set(key, recent);
        return { ok: false, retryAfterSec: Math.max(1, Math.ceil((recent[0] + windowMs - t) / 1000)) };
      }
      recent.push(t);
      hits.set(key, recent);
      return { ok: true, remaining: limit - recent.length };
    },
    reset(key: string) {
      hits.delete(key);
    },
  };
}

const g = globalThis as unknown as { __agentLimiter?: ReturnType<typeof createRateLimiter> };
export const agentLimiter = (limit: number) => (g.__agentLimiter ??= createRateLimiter(limit, 60 * 60 * 1000));
