import "server-only";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { APICallError, type EmbeddingModel, type LanguageModel } from "ai";
import { isFreeOpenRouterModel, listFreeModels } from "./openrouter-free";
import { createAdminClient } from "@/lib/supabase/admin";
import { decryptKey } from "./crypto";
import { PURPOSE_TIMEOUT_MS, type AIPurpose, type Attempt, type AttemptStatus, type ModelEntry } from "./types";

/*
 * Model + key router. Every AI call in the app goes through `runAI`.
 *  - model chain per purpose from `ai_providers` (priority order), cached 30 s
 *  - keys from `ai_keys` (encrypted) + GEMINI_API_KEYS env fallback, least-recently-used first
 *  - 429 → key cools down 60 s, next key; 5xx/timeout → next model; invalid output → next model
 *  - circuit breaker: 3 failures in 60 s → model skipped for 30 s
 *  - every attempt logged to `ai_logs`
 *  - ai_keys.simulate_failure (system panel failover test) → the key answers 429 without a network call
 * State is in-memory per server instance — good enough for a single deployment.
 */

type Key = {
  id: string | null; provider: string; label: string; value: string; rpm: number;
  last4: string; source: "db" | "env"; simulate: boolean;
};
type KeyState = { cooldownUntil: number; lastUsed: number; calls: number[] };
type Breaker = { fails: number[]; openUntil: number };

const g = globalThis as unknown as {
  __aiKeyState?: Map<string, KeyState>;
  __aiBreakers?: Map<string, Breaker>;
  __aiCache?: { at: number; chains: Map<AIPurpose, ModelEntry[]>; keys: Key[] };
};
const keyState: Map<string, KeyState> = (g.__aiKeyState ??= new Map());
const breakers: Map<string, Breaker> = (g.__aiBreakers ??= new Map());

const DEFAULT_CHAIN: ModelEntry[] = [
  { provider: "google", model: "gemini-flash-latest", caps: ["vision", "assamese", "json", "tools"] },
  { provider: "google", model: "gemini-flash-lite-latest", caps: ["vision", "assamese", "json", "tools"] },
  // "auto:free" = whatever OpenRouter currently offers for free that matches the purpose's caps
  { provider: "openrouter", model: "auto:free", caps: ["vision", "assamese", "json", "tools"] },
];
const DEFAULT_EMBED: ModelEntry[] = [{ provider: "google", model: "gemini-embedding-001", caps: ["embed"] }];
const DEFAULT_MEDIA: ModelEntry[] = [
  { provider: "google", model: "gemini-2.5-flash", caps: ["video", "audio", "json", "assamese"] },
  { provider: "google", model: "gemini-2.0-flash", caps: ["video", "audio", "json", "assamese"] },
];

async function loadConfig() {
  if (g.__aiCache && Date.now() - g.__aiCache.at < 30_000) return g.__aiCache;
  const db = createAdminClient();
  const [{ data: providers }, { data: keyRows }] = await Promise.all([
    db.from("ai_providers").select("provider, model, purpose, caps").eq("enabled", true).order("priority"),
    db.from("ai_keys").select("id, provider, label, key_encrypted, key_last4, rpm_limit, simulate_failure").eq("enabled", true),
  ]);
  const chains = new Map<AIPurpose, ModelEntry[]>();
  for (const p of providers ?? []) {
    const list = chains.get(p.purpose as AIPurpose) ?? [];
    list.push({ provider: p.provider, model: p.model, caps: p.caps ?? [] });
    chains.set(p.purpose as AIPurpose, list);
  }
  const keys: Key[] = [];
  for (const k of keyRows ?? []) {
    try {
      keys.push({
        id: k.id, provider: k.provider, label: k.label, value: decryptKey(k.key_encrypted), rpm: k.rpm_limit,
        last4: k.key_last4, source: "db", simulate: Boolean(k.simulate_failure),
      });
    } catch {
      /* undecryptable key (secret changed) — skip */
    }
  }
  (process.env.GEMINI_API_KEYS ?? "").split(",").map((s) => s.trim()).filter(Boolean)
    .forEach((value, i) => keys.push({ id: null, provider: "google", label: `env-gemini-${i + 1}`, value, rpm: 10, last4: value.slice(-4), source: "env", simulate: false }));
  (process.env.OPENROUTER_API_KEYS ?? "").split(",").map((s) => s.trim()).filter(Boolean)
    .forEach((value, i) => keys.push({ id: null, provider: "openrouter", label: `env-openrouter-${i + 1}`, value, rpm: 15, last4: value.slice(-4), source: "env", simulate: false }));
  g.__aiCache = { at: Date.now(), chains, keys };
  return g.__aiCache;
}

/** Call after the system panel changes keys or models: the next runAI reloads chains + keys from the DB. */
export const invalidateRouterCache = () => { g.__aiCache = undefined; };

export const SIMULATED_ERROR = "simulated failure (429)";

/** Clears the in-memory cooldown of a key (e.g. right after its failover test is switched off). */
export const resetKeyState = (label: string) => { keyState.delete(label); };

function pickKeys(keys: Key[], provider: string): Key[] {
  const now = Date.now();
  return keys
    .filter((k) => k.provider === provider)
    .filter((k) => {
      const s = keyState.get(k.label);
      if (!s) return true;
      if (s.cooldownUntil > now) return false;
      return s.calls.filter((t: number) => now - t < 60_000).length < k.rpm;
    })
    .sort((a, b) => (keyState.get(a.label)?.lastUsed ?? 0) - (keyState.get(b.label)?.lastUsed ?? 0));
}

const markUsed = (label: string) => {
  const s = keyState.get(label) ?? { cooldownUntil: 0, lastUsed: 0, calls: [] };
  s.lastUsed = Date.now();
  s.calls = [...s.calls.filter((t) => Date.now() - t < 60_000), Date.now()];
  keyState.set(label, s);
};
const coolDown = (label: string, ms = 60_000) => {
  const s = keyState.get(label) ?? { cooldownUntil: 0, lastUsed: 0, calls: [] };
  s.cooldownUntil = Date.now() + ms;
  keyState.set(label, s);
};
const breakerOpen = (model: string) => (breakers.get(model)?.openUntil ?? 0) > Date.now();
const breakerFail = (model: string) => {
  const b = breakers.get(model) ?? { fails: [], openUntil: 0 };
  b.fails = [...b.fails.filter((t) => Date.now() - t < 60_000), Date.now()];
  if (b.fails.length >= 3) { b.openUntil = Date.now() + 30_000; b.fails = []; }
  breakers.set(model, b);
};
const breakerOk = (model: string) => breakers.delete(model);

function classify(err: unknown): AttemptStatus {
  if (err instanceof Error && (err.name === "AbortError" || err.name === "TimeoutError")) return "timeout";
  if (APICallError.isInstance(err)) {
    if (err.statusCode === 429) return "rate_limited";
    if (err.statusCode === 401 || err.statusCode === 403) return "rate_limited"; // bad/revoked key → treat like a dead key
    return "error";
  }
  if (err instanceof Error && /schema|parse|validation|No object generated|NoObjectGenerated/i.test(err.name + err.message)) return "invalid";
  return "error";
}

function modelsFor(key: Key, model: string): Pick<RouterCtx, "languageModel" | "embeddingModel"> {
  if (key.provider === "google") {
    const p = createGoogleGenerativeAI({ apiKey: key.value });
    return { languageModel: () => p(model), embeddingModel: () => p.textEmbeddingModel(model) };
  }
  if (key.provider === "openrouter") {
    if (!isFreeOpenRouterModel(model)) throw new Error(`Refusing paid OpenRouter model ${model} (free models only)`);
    const p = createOpenRouter({ apiKey: key.value, headers: { "X-Title": "CivicSense" } });
    return {
      languageModel: () => p(model),
      embeddingModel: () => { throw new Error("OpenRouter embeddings not used"); },
    };
  }
  throw new Error(`Provider ${key.provider} not wired yet`);
}

export type RouterCtx = {
  languageModel: () => LanguageModel;
  embeddingModel: () => EmbeddingModel;
  model: string;
  abortSignal: AbortSignal;
};

/** Expand "auto:free" OpenRouter entries into the currently free models that fit. */
async function expandChain(chain: ModelEntry[], caps: string[]): Promise<ModelEntry[]> {
  const out: ModelEntry[] = [];
  for (const m of chain) {
    if (m.provider === "openrouter" && m.model === "auto:free") {
      const want = caps.filter((c) => c !== "assamese"); // OpenRouter can't tell us Assamese quality
      for (const id of await listFreeModels(want)) out.push({ provider: "openrouter", model: id, caps: m.caps });
    } else if (m.provider !== "openrouter" || isFreeOpenRouterModel(m.model)) {
      out.push(m);
    }
  }
  return out;
}

export class AIUnavailableError extends Error {
  constructor(public attempts: Attempt[]) {
    super("All AI models and keys failed");
    this.name = "AIUnavailableError";
  }
}

export async function runAI<T>(
  purpose: AIPurpose,
  call: (ctx: RouterCtx) => Promise<T>,
  opts: { requireCaps?: string[]; timeoutMs?: number } = {},
): Promise<{ result: T; attempts: Attempt[]; model: string }> {
  const cfg = await loadConfig();
  const fallback = purpose === "embed" ? DEFAULT_EMBED : purpose === "media_extract" ? DEFAULT_MEDIA : DEFAULT_CHAIN;
  const caps = opts.requireCaps ?? [];
  const configured = (cfg.chains.get(purpose) ?? []).filter((m) => caps.every((c) => m.caps.includes(c)));
  const chain = await expandChain(configured.length ? configured : fallback.filter((m) => caps.every((c) => m.caps.includes(c))), caps);
  const timeout = opts.timeoutMs ?? PURPOSE_TIMEOUT_MS[purpose];
  const attempts: Attempt[] = [];

  for (const entry of chain) {
    if (breakerOpen(entry.model)) {
      attempts.push({ ...entry, keyLabel: "-", status: "skipped", latencyMs: 0, error: "circuit open" });
      continue;
    }
    const keys = pickKeys(cfg.keys, entry.provider);
    let retriedServerError = false;
    for (const key of keys) {
      markUsed(key.label);
      if (key.simulate) {
        // Failover test switch: behave exactly like a 429 (same as the Go engine), no network call.
        const a: Attempt = { provider: entry.provider, model: entry.model, keyLabel: key.label, status: "rate_limited", latencyMs: 0, error: SIMULATED_ERROR };
        attempts.push(a);
        void log(purpose, a);
        coolDown(key.label);
        continue;
      }
      const started = Date.now();
      try {
        const result = await call({ ...modelsFor(key, entry.model), model: entry.model, abortSignal: AbortSignal.timeout(timeout) });
        const a: Attempt = { provider: entry.provider, model: entry.model, keyLabel: key.label, status: "ok", latencyMs: Date.now() - started };
        attempts.push(a);
        breakerOk(entry.model);
        void log(purpose, a);
        return { result, attempts, model: entry.model };
      } catch (err) {
        const status = classify(err);
        const a: Attempt = {
          provider: entry.provider, model: entry.model, keyLabel: key.label, status,
          latencyMs: Date.now() - started, error: err instanceof Error ? err.message.slice(0, 300) : String(err),
        };
        attempts.push(a);
        void log(purpose, a);
        if (status === "rate_limited") { coolDown(key.label); continue; } // same model, next key
        if (status === "error" && !retriedServerError) {                // one retry with jitter
          retriedServerError = true;
          await new Promise((r) => setTimeout(r, 300 + Math.random() * 400));
          continue;
        }
        breakerFail(entry.model);
        break; // timeout / invalid / repeated error → next model
      }
    }
  }
  throw new AIUnavailableError(attempts);
}

async function log(purpose: AIPurpose | "key_test", a: Attempt) {
  try {
    await createAdminClient().from("ai_logs").insert({
      purpose, provider: a.provider, model: a.model, key_label: a.keyLabel,
      latency_ms: a.latencyMs, status: a.status, error: a.error ?? null,
    });
  } catch {
    /* logging must never break a request */
  }
}

/* ---------- System panel (S20/S21): read-only snapshot + per-key probe ---------- */

export type RouterKeySnapshot = {
  id: string | null; label: string; provider: string; last4: string; source: "db" | "env"; rpm: number;
  simulate: boolean; cooldownUntil: string | null; callsLastMinute: number;
};
export type RouterSnapshot = {
  loadedAt: string; keys: RouterKeySnapshot[]; openBreakers: { model: string; openUntil: string }[];
};

/** In-process router state of this server instance (keys never leave as more than last 4). */
export async function routerSnapshot(): Promise<RouterSnapshot> {
  const cfg = await loadConfig();
  const now = Date.now();
  return {
    loadedAt: new Date(cfg.at).toISOString(),
    keys: cfg.keys.map((k) => {
      const st = keyState.get(k.label);
      return {
        id: k.id, label: k.label, provider: k.provider, last4: k.last4, source: k.source, rpm: k.rpm, simulate: k.simulate,
        cooldownUntil: st && st.cooldownUntil > now ? new Date(st.cooldownUntil).toISOString() : null,
        callsLastMinute: st ? st.calls.filter((t) => now - t < 60_000).length : 0,
      };
    }),
    openBreakers: [...breakers.entries()]
      .filter(([, b]) => b.openUntil > now)
      .map(([model, b]) => ({ model, openUntil: new Date(b.openUntil).toISOString() })),
  };
}

export type KeyProbe = { label: string; provider: string; model: string | null; status: AttemptStatus | "no_model"; latencyMs: number; error?: string };

/**
 * One cheap call per enabled key ("Test all"), bypassing chains and cooldowns so every key is checked.
 * Simulated keys report rate_limited without a network call. Each probe is logged as purpose "key_test".
 */
export async function probeKeys(
  call: (ctx: RouterCtx) => Promise<unknown>,
): Promise<KeyProbe[]> {
  const cfg = await loadConfig();
  const firstGoogle = [...cfg.chains.values()].flat().find((m) => m.provider === "google" && !m.caps.includes("embed"))?.model
    ?? "gemini-flash-lite-latest";
  const freeOr = (await listFreeModels([]))[0] ?? null;
  return Promise.all(cfg.keys.map(async (key): Promise<KeyProbe> => {
    const model = key.provider === "google" ? firstGoogle : key.provider === "openrouter" ? freeOr : null;
    if (!model) return { label: key.label, provider: key.provider, model: null, status: "no_model", latencyMs: 0 };
    const base = { provider: key.provider, model, keyLabel: key.label };
    if (key.simulate) {
      const a: Attempt = { ...base, status: "rate_limited", latencyMs: 0, error: SIMULATED_ERROR };
      void log("key_test", a);
      return { label: key.label, provider: key.provider, model, status: a.status, latencyMs: 0, error: a.error };
    }
    const started = Date.now();
    try {
      await call({ ...modelsFor(key, model), model, abortSignal: AbortSignal.timeout(10_000) });
      const a: Attempt = { ...base, status: "ok", latencyMs: Date.now() - started };
      void log("key_test", a);
      return { label: key.label, provider: key.provider, model, status: "ok", latencyMs: a.latencyMs };
    } catch (err) {
      const a: Attempt = { ...base, status: classify(err), latencyMs: Date.now() - started, error: err instanceof Error ? err.message.slice(0, 300) : String(err) };
      void log("key_test", a);
      return { label: key.label, provider: key.provider, model, status: a.status, latencyMs: a.latencyMs, error: a.error };
    }
  }));
}
