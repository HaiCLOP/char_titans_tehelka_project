import "server-only";
import { z } from "zod";

// Client for the Go backend engine (engine/). Server code only: ENGINE_SECRET never reaches the browser.
// Every call returns null when the engine is unset, down, slow or returns something unexpected,
// so callers can fall back to the in-process TypeScript code.

const DEFAULT_TIMEOUT_MS = 12_000;

export function engineEnabled() {
  return Boolean(process.env.ENGINE_URL && process.env.ENGINE_SECRET);
}

export async function engineFetch<T>(
  path: string,
  body: unknown,
  schema: z.ZodType<T>,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<T | null> {
  if (!engineEnabled()) return null;
  try {
    const res = await fetch(new URL(path, process.env.ENGINE_URL), {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${process.env.ENGINE_SECRET}` },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
      cache: "no-store",
    });
    if (!res.ok) {
      console.warn(`[engine] ${path} → HTTP ${res.status}`);
      return null;
    }
    const parsed = schema.safeParse(await res.json());
    if (!parsed.success) {
      console.warn(`[engine] ${path} → unexpected response`, parsed.error.issues.slice(0, 3));
      return null;
    }
    return parsed.data;
  } catch (e) {
    console.warn(`[engine] ${path} → ${e instanceof Error ? e.name : "error"}`);
    return null;
  }
}
