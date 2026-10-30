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
 * State is in-memory per server instance — good enough for a single demo deployment.
 */

type Key = { id: string | null; provider: string; label: string; value: string; rpm: number };
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

async function loadConfig() {
  if (g.__aiCache && Date.now() - g.__aiCache.at < 30_000) return g.__aiCache;
  const db = createAdminClient();
  const [{ data: providers }, { data: keyRows }] = await Promise.all([
    db.from("ai_providers").select("provider, model, purpose, caps").eq("enabled", true).order("priority"),
    db.from("ai_keys").select("id, provider, label, key_encrypted, rpm_limit").eq("enabled", true),
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
      keys.push({ id: k.id, provider: k.provider, label: k.label, value: decryptKey(k.key_encrypted), rpm: k.rpm_limit });
    } catch {
      /* undecryptable key (secret changed) — skip */
    }
  }
  (process.env.GEMINI_API_KEYS ?? "").split(",").map((s) => s.trim()).filter(Boolean)
    .forEach((value, i) => keys.push({ id: null, provider: "google", label: `env-gemini-${i + 1}`, value, rpm: 10 }));
  (process.env.OPENROUTER_API_KEYS ?? "").split(",").map((s) => s.trim()).filter(Boolean)
    .forEach((value, i) => keys.push({ id: null, provider: "openrouter", label: `env-openrouter-${i + 1}`, value, rpm: 15 }));
  g.__aiCache = { at: Date.now(), chains, keys };
  return g.__aiCache;
}

/** Call after the system panel changes keys or models. */
export const invalidateAIConfig = () => { g.__aiCache = undefined; };

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
  const fallback = purpose === "embed" ? DEFAULT_EMBED : DEFAULT_CHAIN;
  const caps = opts.requireCaps ?? [];
  const chain = await expandChain(
    (cfg.chains.get(purpose) ?? fallback).filter((m) => caps.every((c) => m.caps.includes(c))),
    caps,
  );
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
      const started = Date.now();
      markUsed(key.label);
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

async function log(purpose: AIPurpose, a: Attempt) {
  try {
    await createAdminClient().from("ai_logs").insert({
      purpose, provider: a.provider, model: a.model, key_label: a.keyLabel,
      latency_ms: a.latencyMs, status: a.status, error: a.error ?? null,
    });
  } catch {
    /* logging must never break a request */
  }
}
