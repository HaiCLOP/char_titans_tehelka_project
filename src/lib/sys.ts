import "server-only";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { z } from "zod";
import { fail } from "@/lib/api";
import { PROFILE_COLUMNS } from "@/lib/auth";
import type { Profile } from "@/lib/domain";
import { engineEnabled, engineFetch } from "@/lib/engine";
import { invalidateRouterCache, routerSnapshot, type RouterKeySnapshot } from "@/lib/ai/router";
import { AI_PURPOSES } from "@/lib/ai/types";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { SYS_HEADER, sysPanelSegment } from "@/lib/sys-path";

/*
 * System panel (PRD S20–S23, section 13). Three checks, all required, and every failure is a plain
 * 404 so the panel's existence is never revealed:
 *   1. secret path  — src/proxy.ts rewrites /${SYS_PANEL_PATH}/… to /sys/… and sets SYS_HEADER (pages only)
 *   2. role         — profiles.role = super_admin
 *   3. allowlist    — auth email in SYS_PANEL_EMAILS
 * ai_* tables have no RLS policies by design, so reads/writes here use the admin client, only after the check.
 */

export type SysContext = { user: User; profile: Profile };

const allowlist = () =>
  (process.env.SYS_PANEL_EMAILS ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);

async function sysAccess(): Promise<SysContext | null> {
  if (!sysPanelSegment()) return null;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const email = user?.email?.toLowerCase();
  if (!user || !email || !allowlist().includes(email)) return null;
  const { data } = await supabase.from("profiles").select(PROFILE_COLUMNS).eq("id", user.id).maybeSingle();
  const profile = data as Profile | null;
  if (profile?.role !== "super_admin") return null;
  return { user, profile };
}

/** Whether the signed-in user passes the role + allowlist checks (e.g. to show a panel link inside /admin). */
export const canUseSysPanel = async () => (await sysAccess()) !== null;

/** For /api/sys/* route handlers: the context, or a 404 Response. */
export async function requireSysApi(): Promise<SysContext | Response> {
  return (await sysAccess()) ?? fail("NOT_FOUND", "No such route");
}

/** For pages under src/app/sys: notFound() unless reached through the secret path by an allowed user. */
export async function requireSysPage(): Promise<SysContext & { base: string }> {
  const segment = sysPanelSegment();
  if (!segment || (await headers()).get(SYS_HEADER) !== "1") notFound();
  const ctx = await sysAccess();
  if (!ctx) notFound();
  return { ...ctx, base: `/${segment}` };
}

/* ---------- Engine (Go) ---------- */

async function engineGet<T>(path: string, schema: z.ZodType<T>, auth: boolean): Promise<T | null> {
  if (!engineEnabled()) return null;
  try {
    const res = await fetch(new URL(path, process.env.ENGINE_URL), {
      headers: auth ? { authorization: `Bearer ${process.env.ENGINE_SECRET}` } : {},
      signal: AbortSignal.timeout(2500),
      cache: "no-store",
    });
    if (!res.ok) return null;
    const parsed = schema.safeParse(await res.json());
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

const EngineHealth = z.object({ ok: z.boolean(), uptime_s: z.number(), db_connected: z.boolean(), version: z.string() });
const EngineKey = z.object({
  label: z.string(), provider: z.string(), last4: z.string().optional().default(""), source: z.string().optional().default("db"),
  simulate_failure: z.boolean().optional().default(false), calls_last_minute: z.number().optional().default(0),
  ok: z.number().optional().default(0), fail: z.number().optional().default(0), cooldown_until: z.string().nullable().optional(),
});
const EngineMetrics = z.object({
  config_loaded_at: z.string().optional(),
  config_from_db: z.boolean().optional(),
  keys: z.array(EngineKey).nullable().optional(),
  open_breakers: z.array(z.object({ model: z.string(), open_until: z.string() })).nullable().optional(),
  dropped_logs: z.number().optional(),
  workers: z.record(z.string(), z.unknown()).nullable().optional(),
});
type EngineMetrics = z.infer<typeof EngineMetrics>;

/** Ask the Go engine to reload chains + keys now (it otherwise refreshes every 30 s). */
async function engineInvalidate(): Promise<boolean> {
  return (await engineFetch("/v1/router/invalidate", {}, z.object({ ok: z.boolean() }), 3000))?.ok ?? false;
}

/** After every key/model change: drop the TS router cache and reload the engine. */
/** engine: true = reloaded, false = configured but unreachable, null = no engine configured. */
export async function invalidateRouters(): Promise<{ engine: boolean | null }> {
  invalidateRouterCache();
  return { engine: engineEnabled() ? await engineInvalidate() : null };
}

/* ---------- Health (S20) ---------- */

type LogRow = {
  id: number; purpose: string; provider: string | null; model: string | null; key_label: string | null;
  latency_ms: number | null; status: string; error: string | null; created_at: string;
};
const LOG_COLUMNS = "id, purpose, provider, model, key_label, latency_ms, status, error, created_at";

const percentile = (sorted: number[], p: number) =>
  sorted.length ? sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)] : null;

export type ModelTile = {
  purpose: string; provider: string; model: string; calls: number; ok: number; successRate: number | null;
  p50: number | null; p95: number | null; lastAt: string | null;
  lastError: { status: string; error: string | null; at: string } | null;
};

export type KeyStatus = "ok" | "cooling" | "simulated" | "disabled";
export type KeyRowOut = {
  id: string | null; label: string; provider: string; last4: string; source: "db" | "env";
  enabled: boolean; rpm: number; simulate: boolean; status: KeyStatus; cooldownUntil: string | null;
  callsLastMinute: number; okLastHour: number; failsLastHour: number; lastUsedAt: string | null; createdAt: string | null;
};

type DbKey = {
  id: string; provider: string; label: string; key_last4: string; enabled: boolean; rpm_limit: number;
  simulate_failure: boolean; last_used_at: string | null; created_at: string;
};

const laterOf = (a: string | null | undefined, b: string | null | undefined) => {
  const now = Date.now();
  const valid = [a, b].filter((x): x is string => !!x && Date.parse(x) > now);
  return valid.sort().at(-1) ?? null;
};

/** Every key the routers know about (DB rows incl. disabled + env keys), with live status. */
function buildKeys(dbKeys: DbKey[], snap: RouterKeySnapshot[], metrics: EngineMetrics | null, logs: LogRow[]): KeyRowOut[] {
  const now = Date.now();
  const engineKeys = new Map((metrics?.keys ?? []).map((k) => [k.label, k]));
  const tsKeys = new Map(snap.map((k) => [k.label, k]));
  const recent = logs.filter((l) => now - Date.parse(l.created_at) < 3_600_000);
  const stats = (label: string) => {
    const mine = recent.filter((l) => l.key_label === label);
    return {
      callsLastMinute: mine.filter((l) => now - Date.parse(l.created_at) < 60_000).length,
      okLastHour: mine.filter((l) => l.status === "ok").length,
      failsLastHour: mine.filter((l) => l.status !== "ok" && l.status !== "skipped").length,
    };
  };
  const status = (enabled: boolean, simulate: boolean, cooldown: string | null): KeyStatus =>
    !enabled ? "disabled" : simulate ? "simulated" : cooldown ? "cooling" : "ok";

  const rows: KeyRowOut[] = dbKeys.map((k) => {
    const cooldown = laterOf(tsKeys.get(k.label)?.cooldownUntil, engineKeys.get(k.label)?.cooldown_until);
    return {
      id: k.id, label: k.label, provider: k.provider, last4: k.key_last4, source: "db", enabled: k.enabled, rpm: k.rpm_limit,
      simulate: k.simulate_failure, status: status(k.enabled, k.simulate_failure, cooldown), cooldownUntil: cooldown,
      ...stats(k.label), lastUsedAt: k.last_used_at, createdAt: k.created_at,
    };
  });
  for (const k of snap.filter((s) => s.source === "env")) {
    const cooldown = laterOf(k.cooldownUntil, engineKeys.get(k.label)?.cooldown_until);
    rows.push({
      id: null, label: k.label, provider: k.provider, last4: k.last4, source: "env", enabled: true, rpm: k.rpm, simulate: false,
      status: status(true, false, cooldown), cooldownUntil: cooldown, ...stats(k.label), lastUsedAt: null, createdAt: null,
    });
  }
  return rows;
}

function buildModelTiles(logs: LogRow[], chains: Awaited<ReturnType<typeof listChains>>): ModelTile[] {
  const groups = new Map<string, LogRow[]>();
  for (const l of logs) {
    if (!l.model || !l.provider || l.status === "skipped") continue;
    const k = `${l.purpose}|${l.provider}|${l.model}`;
    const g = groups.get(k) ?? [];
    if (g.length < 100) g.push(l); // logs are newest first → last 100 calls
    groups.set(k, g);
  }
  // Every configured, enabled chain entry gets a tile even before it has traffic.
  for (const c of chains) {
    for (const m of c.models.filter((x) => x.enabled && x.model !== "auto:free")) {
      const k = `${c.purpose}|${m.provider}|${m.model}`;
      if (!groups.has(k)) groups.set(k, []);
    }
  }
  return [...groups.entries()].map(([k, rows]) => {
    const [purpose, provider, model] = k.split("|");
    const ok = rows.filter((r) => r.status === "ok");
    const lat = ok.map((r) => r.latency_ms ?? 0).filter((n) => n > 0).sort((a, b) => a - b);
    const err = rows.find((r) => r.status !== "ok");
    return {
      purpose, provider, model, calls: rows.length, ok: ok.length,
      successRate: rows.length ? ok.length / rows.length : null,
      p50: percentile(lat, 50), p95: percentile(lat, 95), lastAt: rows[0]?.created_at ?? null,
      lastError: err ? { status: err.status, error: err.error, at: err.created_at } : null,
    };
  }).sort((a, b) => a.purpose.localeCompare(b.purpose) || (b.lastAt ?? "").localeCompare(a.lastAt ?? ""));
}

async function recentLogs(limit: number): Promise<LogRow[]> {
  const { data, error } = await createAdminClient().from("ai_logs").select(LOG_COLUMNS)
    .gte("created_at", new Date(Date.now() - 7 * 86_400_000).toISOString())
    .order("created_at", { ascending: false }).limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []) as LogRow[];
}

async function dbKeys(): Promise<DbKey[]> {
  const { data, error } = await createAdminClient().from("ai_keys")
    .select("id, provider, label, key_last4, enabled, rpm_limit, simulate_failure, last_used_at, created_at")
    .order("created_at");
  if (error) throw new Error(error.message);
  return (data ?? []) as DbKey[];
}

export type EngineState =
  | { state: "disabled" }
  | { state: "offline" }
  | {
      state: "online"; version: string; uptimeS: number; dbConnected: boolean; configLoadedAt: string | null;
      configFromDb: boolean | null; openBreakers: { model: string; openUntil: string }[]; droppedLogs: number | null;
      workers: string[];
    };

async function engineState(): Promise<{ engine: EngineState; metrics: EngineMetrics | null }> {
  if (!engineEnabled()) return { engine: { state: "disabled" }, metrics: null };
  const [health, metrics] = await Promise.all([
    engineGet("/health", EngineHealth, false),
    engineGet("/metrics", EngineMetrics, true),
  ]);
  if (!health) return { engine: { state: "offline" }, metrics: null };
  return {
    metrics,
    engine: {
      state: "online", version: health.version, uptimeS: health.uptime_s, dbConnected: health.db_connected,
      configLoadedAt: metrics?.config_loaded_at ?? null, configFromDb: metrics?.config_from_db ?? null,
      openBreakers: (metrics?.open_breakers ?? []).map((b) => ({ model: b.model, openUntil: b.open_until })),
      droppedLogs: metrics?.dropped_logs ?? null, workers: Object.keys(metrics?.workers ?? {}),
    },
  };
}

export type SysHealth = {
  generatedAt: string;
  engine: EngineState;
  web: { loadedAt: string; openBreakers: { model: string; openUntil: string }[] };
  models: ModelTile[];
  keys: KeyRowOut[];
};

export async function getSysHealth(): Promise<SysHealth> {
  const [logs, keys, snap, eng, chains] = await Promise.all([recentLogs(3000), dbKeys(), routerSnapshot(), engineState(), listChains()]);
  return {
    generatedAt: new Date().toISOString(),
    engine: eng.engine,
    web: { loadedAt: snap.loadedAt, openBreakers: snap.openBreakers },
    models: buildModelTiles(logs, chains),
    keys: buildKeys(keys, snap.keys, eng.metrics, logs),
  };
}

export async function listKeys(): Promise<{ keys: KeyRowOut[]; engine: EngineState["state"] }> {
  const [logs, keys, snap, eng] = await Promise.all([recentLogs(1000), dbKeys(), routerSnapshot(), engineState()]);
  return { keys: buildKeys(keys, snap.keys, eng.metrics, logs), engine: eng.engine.state };
}

/* ---------- Model chains (S22) ---------- */

export type ChainModel = { id: string; provider: string; model: string; priority: number; enabled: boolean; caps: string[] };
export type Chain = { purpose: string; models: ChainModel[] };

export async function listChains(): Promise<Chain[]> {
  const { data, error } = await createAdminClient().from("ai_providers")
    .select("id, provider, model, purpose, priority, enabled, caps").order("priority").order("id");
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as (ChainModel & { purpose: string })[];
  return AI_PURPOSES.map((purpose) => ({
    purpose,
    models: rows.filter((r) => r.purpose === purpose).map(({ id, provider, model, priority, enabled, caps }) => ({
      id, provider, model, priority, enabled, caps: caps ?? [],
    })),
  }));
}

/* ---------- Logs (S23) ---------- */

export const LOG_STATUSES = ["ok", "rate_limited", "error", "timeout", "invalid", "skipped", "fallback"] as const;

export const LogQuery = z.object({
  purpose: z.string().max(40).optional(),
  status: z.enum(LOG_STATUSES).optional(),
  provider: z.enum(["google", "openrouter"]).optional(),
  model: z.string().max(120).optional(),
  key: z.string().max(80).optional(),
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
  cursor: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().min(10).max(100).default(50),
});
export type LogQuery = z.infer<typeof LogQuery>;

export type LogItem = LogRow & {
  /** Rows of one failover chain share a chain id (the id of its final row). */
  chain: number | null;
  /** final = last attempt of the chain (ok/fallback); step = an earlier failed attempt. */
  chainRole: "final" | "step" | null;
};

const like = (s: string) => `%${s.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;

/**
 * Newest first, keyset-paginated by id. Failover chains (ai_logs has no request id) are detected
 * heuristically: an ok/fallback row plus the failed attempts for the same purpose right before it,
 * each within 2 s of the next. Chains are only detected within a page.
 */
export async function queryLogs(q: LogQuery): Promise<{ items: LogItem[]; nextCursor: number | null }> {
  let req = createAdminClient().from("ai_logs").select(LOG_COLUMNS).order("id", { ascending: false }).limit(q.limit + 1);
  if (q.purpose) req = req.eq("purpose", q.purpose);
  if (q.status) req = req.eq("status", q.status);
  if (q.provider) req = req.eq("provider", q.provider);
  if (q.model) req = req.ilike("model", like(q.model));
  if (q.key) req = req.ilike("key_label", like(q.key));
  if (q.from) req = req.gte("created_at", `${q.from}T00:00:00Z`);
  if (q.to) req = req.lt("created_at", new Date(Date.parse(`${q.to}T00:00:00Z`) + 86_400_000).toISOString());
  if (q.cursor) req = req.lt("id", q.cursor);
  const { data, error } = await req;
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as LogRow[];
  const more = rows.length > q.limit;
  const page = rows.slice(0, q.limit);

  const items: LogItem[] = page.map((r) => ({ ...r, chain: null, chainRole: null }));
  for (let i = 0; i < items.length; i++) {
    const head = items[i];
    if (head.chain !== null || (head.status !== "ok" && head.status !== "fallback")) continue;
    const steps: number[] = [];
    let prev = head;
    for (let j = i + 1; j < items.length; j++) {
      const r = items[j];
      if (r.chain !== null || r.purpose !== head.purpose || r.status === "ok" || r.status === "fallback") break;
      if (Date.parse(prev.created_at) - Date.parse(r.created_at) > 2000 + (prev.latency_ms ?? 0)) break;
      steps.push(j);
      prev = r;
    }
    if (!steps.length) continue;
    head.chain = head.id;
    head.chainRole = "final";
    for (const j of steps) { items[j].chain = head.id; items[j].chainRole = "step"; }
  }
  return { items, nextCursor: more ? page.at(-1)!.id : null };
}
