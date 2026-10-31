import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

export type RateResult = { ok: true } | { ok: false; retryAfterSec: number };

/**
 * Shared per-user rate limit, counted in Postgres (rpc hit_rate_limit, migration 11), so it holds across
 * server instances and restarts — unlike the in-memory limiters it replaces. Call with the caller's own
 * client: the function reads auth.uid(). If the database can't answer, the request is allowed (logged):
 * a limiter outage must not take the product down.
 */
export async function hitRateLimit(supabase: SupabaseClient, bucket: string, max: number, windowSeconds: number): Promise<RateResult> {
  const { data, error } = await supabase.rpc("hit_rate_limit", { p_bucket: bucket, p_max: max, p_window_seconds: windowSeconds });
  if (error) {
    console.warn(`[ratelimit] ${bucket} check failed, allowing`, error.code);
    return { ok: true };
  }
  const wait = Number(data) || 0;
  return wait > 0 ? { ok: false, retryAfterSec: wait } : { ok: true };
}
