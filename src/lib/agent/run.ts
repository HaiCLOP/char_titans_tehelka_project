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
