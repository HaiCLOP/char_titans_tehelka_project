import "server-only";
import { generateText, stepCountIs, type ModelMessage } from "ai";
import type { SupabaseClient } from "@supabase/supabase-js";
import { runAI } from "@/lib/ai/router";
import { hasBengaliDrift, isAssameseText } from "@/lib/utils";
import { agentInstructions } from "./prompt";
import {
  AGENT_HISTORY_TURNS, AGENT_MAX_TOOL_STEPS, AgentAnswerSchema, ByCategoryOutput, DepartmentLoadOutput, TopLocationsOutput,
  TrendOutput, type AgentAnswer, type AgentChart, type AgentLang, type AgentRequest,
} from "./schema";
import { canCompareDepartments, type AgentScope } from "./scope";
import { buildAgentTools, type ToolSink } from "./tools";

type ToolName = ToolSink["outputs"][number]["tool"];

/**
 * Runs one "Ask CivicSense" question (PRD S16).
 * - one runAI("agent") call = one multi-step generateText with the read-only tools (≤ 4 tool rounds, then a
 *   forced text-only step); key rotation, failover and logging come from the router
 * - the answer language follows the question's script
 * - Assamese drift guard like intake: one strict retry, then র → ৰ as a last resort
 * - the chart is derived from tool outputs (never from model text), and the result is validated with Zod
 */

/** Whole multi-step loop per model attempt (2 model calls take 10–20 s on the free tier). */
const AGENT_TIMEOUT_MS = 40_000;
/** Fast path: data is fetched first, then ONE model call writes the answer (≈ 2–4 s instead of 10–17 s). */
const FAST_TIMEOUT_MS = 15_000;
const NEED_TOOLS = "NEED_TOOLS";
const ANSWER_TTL_MS = 60_000;

// ---------- fast path ----------

/** Questions the pre-fetched snapshot can't answer go straight to the tool loop. */
const NEEDS_TOOL_LOOP = /\bCS-[A-Z0-9]{4,}\b|\b(list|show|which complaints|details?|latest|recent|newest|oldest)\b|তালিকা|কোনবোৰ|সবিশেষ/i;

/** Same keyword idea as the intake fallback: a category word in the question narrows the location ranking. */
const CATEGORY_WORDS: [string, RegExp][] = [
  ["water_supply", /water|পানী/i],
  ["electrical", /electric|power|light|fan|বিদ্যুৎ|লাইট|পংখা/i],
  ["sanitation", /garbage|dustbin|toilet|dirty|clean|আৱৰ্জনা|শৌচাগাৰ|লেতেৰা/i],
  ["plumbing", /leak|pipe|tap|drain|নলা|পাইপ/i],
  ["it_network", /wi-?fi|internet|network|ৱাই-ফাই|ইণ্টাৰনেট/i],
  ["mess_food", /mess|food|canteen|মেছ|খাদ্য|কেণ্টিন/i],
  ["safety_security", /safety|security|theft|সুৰক্ষা|চুৰি/i],
  ["transport", /transport|bus|vehicle|পৰিবহণ|বাছ/i],
];

/** "today" → 1, "this month" → 30, otherwise a week (the prompt's own convention). */
function periodDays(q: string): number {
  if (/\btoday\b|আজি/i.test(q)) return 1;
  if (/\bmonth\b|30 days|মাহ/i.test(q)) return 30;
  return 7;
}

/** Which chart fits the question; the snapshot holds every candidate. */
function chartTool(q: string): ToolName | null {
  if (/hostel|building|location|where|place|হোষ্টেল|ভৱন|ক'ত|ঠাই/i.test(q)) return "top_locations";
  if (/department|section|বিভাগ|শাখা/i.test(q)) return "department_load";
  if (/categor|type of|kind of|শ্ৰেণী|প্ৰকাৰ/i.test(q)) return "by_category";
  if (/trend|over time|per day|daily|দৈনিক|প্ৰতিদিন/i.test(q)) return "trend";
  return null;
}

type Tools = ReturnType<typeof buildAgentTools>;
type Exec = (input: unknown, opts: { toolCallId: string; messages: ModelMessage[] }) => Promise<unknown>;
const call = (tools: Tools, name: keyof Tools, input: unknown) =>
  (tools[name] as unknown as { execute: Exec }).execute(input, { toolCallId: `prefetch-${String(name)}`, messages: [] });

const answers = ((globalThis as { __agentAnswers?: Map<string, { at: number; value: AgentAnswer }> }).__agentAnswers ??= new Map());

export const questionLang = (q: string): AgentLang => (isAssameseText(q) ? "as" : "en");

type DeptName = { name_en: string; name_as: string };

async function scopeNames(db: SupabaseClient, scope: AgentScope): Promise<DeptName | null> {
  if (!scope.departmentId) return null;
  const { data } = await db.from("departments").select("name_en, name_as").eq("id", scope.departmentId).maybeSingle();
  return (data as DeptName | null) ?? { name_en: "your department", name_as: "আপোনাৰ বিভাগ" };
}

function pickChart(outputs: ToolSink["outputs"]): AgentChart | null {
  for (const { tool, out } of [...outputs].reverse()) {
    if (tool === "trend") {
      const o = TrendOutput.parse(out);
      if (o.series.some((r) => r.created || r.resolved)) {
        return { type: "line", days: o.series.map((r) => r.day), series: o.series.map((r) => r.created), compare: o.series.map((r) => r.resolved) };
      }
    }
    if (tool === "top_locations") {
      const rows = TopLocationsOutput.parse(out).rows.filter((r) => r.total > 0).slice(0, 8);
      if (rows.length) return { type: "bar", tool, rows: rows.map((r) => ({ label_en: r.name_en, label_as: r.name_as, value: r.total })) };
    }
    if (tool === "by_category") {
      const rows = ByCategoryOutput.parse(out).rows.filter((r) => r.total > 0).slice(0, 8);
      if (rows.length) return { type: "bar", tool, rows: rows.map((r) => ({ label_en: r.label_en, label_as: r.label_as, value: r.total })) };
    }
    if (tool === "department_load") {
      const rows = DepartmentLoadOutput.parse(out).rows.filter((r) => r.total_in_period > 0).slice(0, 8);
      if (rows.length) return { type: "bar", tool, rows: rows.map((r) => ({ label_en: r.name_en, label_as: r.name_as, value: r.total_in_period })) };
    }
  }
  return null;
}

export async function askAgent(db: SupabaseClient, scope: AgentScope, req: Pick<AgentRequest, "question" | "history">): Promise<AgentAnswer> {
  const started = Date.now();
  const lang = questionLang(req.question);
  // Same question, same scope, no follow-up context → reuse the answer for a minute.
  const cacheKey = req.history.length ? null : `${scope.departmentId ?? "all"}|${req.question.trim().toLowerCase().replace(/\s+/g, " ")}`;
  const hit = cacheKey ? answers.get(cacheKey) : undefined;
  if (hit && Date.now() - hit.at < ANSWER_TTL_MS) return { ...hit.value, ms: Date.now() - started };

  const result = await answerQuestion(db, scope, req, lang, started);
  if (cacheKey) {
    answers.set(cacheKey, { at: Date.now(), value: result });
    if (answers.size > 200) answers.delete(answers.keys().next().value as string);
  }
  return result;
}

async function answerQuestion(
  db: SupabaseClient, scope: AgentScope, req: Pick<AgentRequest, "question" | "history">, lang: AgentLang, started: number,
): Promise<AgentAnswer> {
  const dept = await scopeNames(db, scope);
  const scopeLabel = dept ? `complaints of the ${dept.name_en} department (${dept.name_as}) only` : "complaints of all departments";
  const messages: ModelMessage[] = [
    ...req.history.slice(-AGENT_HISTORY_TURNS * 2).map((m) => ({ role: m.role, content: m.text }) as ModelMessage),
    { role: "user", content: req.question },
  ];

  const ask = (strict: boolean) =>
    runAI("agent", async ({ languageModel, abortSignal }) => {
      // Fresh tools + sink per attempt, so a failed-over model never leaves half a trace behind.
      const sink: ToolSink = { trace: [], outputs: [] };
      const result = await generateText({
        model: languageModel(),
        instructions: agentInstructions({
          lang, scopeLabel, canCompareDepartments: canCompareDepartments(scope), maxToolSteps: AGENT_MAX_TOOL_STEPS, strict,
        }),
        messages,
        tools: buildAgentTools(db, scope, sink),
        stopWhen: stepCountIs(AGENT_MAX_TOOL_STEPS + 1),
        // The last allowed step must answer in text.
        prepareStep: ({ stepNumber }) => (stepNumber >= AGENT_MAX_TOOL_STEPS ? { toolChoice: "none" } : {}),
        temperature: 0.2,
        abortSignal,
      });
      const text = result.text.trim();
      // "validation" in the message → the router treats it as invalid output and moves to the next model.
      if (!text) throw new Error("Agent answer failed validation: empty text");
      return { text, sink };
    }, { requireCaps: ["tools"], timeoutMs: AGENT_TIMEOUT_MS });

  // ---- fast path: fetch the snapshot in parallel (< 1 s), then one model call without tools ----
  if (!NEEDS_TOOL_LOOP.test(req.question)) {
    const fast = await tryFastPath(db, scope, req.question, lang, scopeLabel, messages);
    if (fast) {
      return AgentAnswerSchema.parse({
        answer: fast.answer,
        lang,
        chart: pickChart(fast.chartOutputs),
        trace: fast.sink.trace.slice(0, 12),
        model: fast.model,
        ms: Date.now() - started,
        scope: { department_en: dept?.name_en ?? null, department_as: dept?.name_as ?? null },
      });
    }
  }

  let r = await ask(false);
  if (lang === "as" && hasBengaliDrift(r.result.text)) {
    try {
      const retry = await ask(true);
      r = retry;
    } catch {
      /* keep the first answer; fixed below */
    }
  }
  let answer = r.result.text;
  if (lang === "as" && hasBengaliDrift(answer)) answer = answer.replace(/র/g, "ৰ"); // Assamese never uses র

  return AgentAnswerSchema.parse({
    answer,
    lang,
    chart: pickChart(r.result.sink.outputs),
    trace: r.result.sink.trace.slice(0, 12),
    model: r.model,
    ms: Date.now() - started,
    scope: { department_en: dept?.name_en ?? null, department_as: dept?.name_as ?? null },
  });
}

async function tryFastPath(
  db: SupabaseClient, scope: AgentScope, question: string, lang: AgentLang, scopeLabel: string, messages: ModelMessage[],
): Promise<{ answer: string; sink: ToolSink; chartOutputs: ToolSink["outputs"]; model: string } | null> {
  const days = periodDays(question);
  const category = CATEGORY_WORDS.find(([, re]) => re.test(question))?.[0];
  const sink: ToolSink = { trace: [], outputs: [] };
  const tools = buildAgentTools(db, scope, sink);
  const compare = canCompareDepartments(scope);
  try {
    await Promise.all([
      call(tools, "stats", { days }),
      call(tools, "by_category", { days }),
      call(tools, "top_locations", { days }),
      call(tools, "top_locations", { days, location_type: "hostel", ...(category ? { category } : {}) }),
      ...(category ? [call(tools, "top_locations", { days, category })] : []),
      ...(compare ? [call(tools, "department_load", { days })] : []),
      call(tools, "trend", { days: Math.max(days, 14) }),
    ]);
  } catch {
    return null; // any data error → the regular tool loop decides what to do
  }
  // Pair each output with the input that produced it (trace and outputs are pushed together, in call order).
  const okTrace = sink.trace.filter((t) => t.ok);
  const data = sink.outputs.map(({ tool, out }, i) => ({ tool, input: okTrace[i]?.input ?? {}, result: out }));

  const instructions = [
    agentInstructions({ lang, scopeLabel, canCompareDepartments: compare, maxToolSteps: 0, strict: false })
      .replace(/- Call tools to get data[^\n]*\n/, ""),
    "",
    "DATA — results of read-only tools, already fetched and scoped for you. Answer ONLY from this data:",
    JSON.stringify(data),
    "",
    `If this data cannot answer the question (it needs specific tickets, a different period, or anything not listed above), reply with exactly ${NEED_TOOLS} and nothing else.`,
  ].join("\n");

  try {
    const r = await runAI("agent", async ({ languageModel, abortSignal }) => {
      const res = await generateText({ model: languageModel(), instructions, messages, temperature: 0.2, abortSignal });
      const text = res.text.trim();
      if (!text) throw new Error("Agent answer failed validation: empty text");
      return text;
    }, { timeoutMs: FAST_TIMEOUT_MS });
    if (r.result.includes(NEED_TOOLS)) return null;
    let answer = r.result;
    if (lang === "as" && hasBengaliDrift(answer)) answer = answer.replace(/র/g, "ৰ"); // Assamese never uses র

    // Chart: the output that matches what was asked (the snapshot holds several candidates).
    const want = chartTool(question);
    const preferred = want === "top_locations"
      ? sink.outputs.filter((o) => o.tool === "top_locations").slice(-1)
      : sink.outputs.filter((o) => o.tool === want);
    return { answer, sink, chartOutputs: want ? preferred : [], model: r.model };
  } catch {
    return null; // fast path failed (timeout, all models down) → the tool loop gets its own chance
  }
}
