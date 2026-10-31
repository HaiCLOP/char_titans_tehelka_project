#!/usr/bin/env node
// Demo warm-up (PRD M10). Plain Node 20+, no dependencies.
// Hits the key pages and APIs so Next compiles them, and wakes the Go engine.
//
//   pnpm warmup                       # web at http://localhost:3000
//   pnpm warmup -- --base http://localhost:3300 --intake
//   WARMUP_BASE=https://… pnpm warmup
//
// --intake also sends one tiny /v1/intake request to the engine (uses one AI call).
// ENGINE_URL / ENGINE_SECRET come from the environment or .env.local. Secrets are never printed.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const opt = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};

function loadEnvLocal() {
  const env = {};
  try {
    for (const line of readFileSync(join(root, ".env.local"), "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  } catch {
    // no .env.local: rely on the process environment
  }
  return env;
}

const fileEnv = loadEnvLocal();
const env = (k) => process.env[k] || fileEnv[k] || "";
const base = (opt("base") || env("WARMUP_BASE") || "http://localhost:3000").replace(/\/$/, "");
const engineUrl = env("ENGINE_URL").replace(/\/$/, "");
const engineSecret = env("ENGINE_SECRET");
const TIMEOUT_MS = Number(opt("timeout") || 90_000); // first compile in `next dev` can be slow

const targets = [
  { name: "home", url: `${base}/` },
  { name: "pulse", url: `${base}/pulse` },
  { name: "map", url: `${base}/map` },
  { name: "login", url: `${base}/login` },
  { name: "report (signed out)", url: `${base}/report` },
  { name: "admin (signed out)", url: `${base}/admin` },
  { name: "api transitions", url: `${base}/api/meta/transitions` },
  { name: "api locations", url: `${base}/api/locations` },
  { name: "api config", url: `${base}/api/meta/config` },
];
if (engineUrl) targets.push({ name: "engine health", url: `${engineUrl}/health` });
if (engineUrl && engineSecret && flag("intake")) {
  targets.push({
    name: "engine intake",
    url: `${engineUrl}/v1/intake`,
    init: {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${engineSecret}` },
      body: JSON.stringify({ text: "Warm-up: tube light not working in the library reading room", images: [] }),
    },
  });
}

async function hit(t) {
  const started = performance.now();
  try {
    const res = await fetch(t.url, { redirect: "manual", signal: AbortSignal.timeout(TIMEOUT_MS), ...t.init });
    await res.arrayBuffer();
    return { ...t, status: res.status, ms: Math.round(performance.now() - started) };
  } catch (e) {
    return { ...t, status: e?.name === "TimeoutError" ? "timeout" : "down", ms: Math.round(performance.now() - started) };
  }
}

const show = (u) => u.replace(engineUrl || "\u0000", "<ENGINE_URL>");
console.log(`Warming ${base}${engineUrl ? " + engine" : " (ENGINE_URL not set: engine skipped)"}\n`);
const rows = [];
for (const t of targets) rows.push(await hit(t)); // sequential: avoids parallel cold compiles fighting each other
const ok = (s) => typeof s === "number" && s < 500;
const w = Math.max(...rows.map((r) => r.name.length));
for (const r of rows) {
  console.log(`${ok(r.status) ? "ok  " : "FAIL"}  ${r.name.padEnd(w)}  ${String(r.status).padStart(7)}  ${String(r.ms).padStart(6)} ms  ${show(r.url)}`);
}
const failed = rows.filter((r) => !ok(r.status));
console.log(failed.length ? `\n${failed.length} target(s) failed.` : "\nAll warm.");
process.exit(failed.length ? 1 : 0);
