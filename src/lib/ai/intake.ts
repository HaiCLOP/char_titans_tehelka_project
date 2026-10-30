import "server-only";
import { embed, generateText, Output } from "ai";
import { createHash } from "node:crypto";
import { z } from "zod";
import { IntakeSchema, type Intake } from "@/lib/domain";
import { engineFetch } from "@/lib/engine";
import { hasBengaliDrift } from "@/lib/utils";
import { fallbackIntake } from "./fallback";
import { intakeSystem, INTAKE_PROMPT_VERSION } from "./prompts/intake";
import { AIUnavailableError, runAI } from "./router";
import type { Attempt } from "./types";

export type IntakeResult = {
  intake: Intake;
  source: "ai" | "fallback";
  /** Which backend produced it: the Go engine or this Next.js server. */
  via: "engine" | "web";
  model?: string;
  attempts: Attempt[];
  ms: number;
};

const EngineIntakeSchema = z.object({
  intake: IntakeSchema,
  source: z.enum(["ai", "fallback"]),
  model: z.string().optional(),
  // The engine reports its own attempts; we don't depend on their exact shape.
  attempts: z.array(z.object({
    provider: z.string(), model: z.string(), keyLabel: z.string(),
    status: z.enum(["ok", "rate_limited", "error", "timeout", "invalid", "skipped"]),
    latencyMs: z.number(), error: z.string().optional(),
  })).catch([]).default([]),
});

const cache = ((globalThis as { __intakeCache?: Map<string, IntakeResult> }).__intakeCache ??= new Map());

/** Urgent always means P1 (PRD rule 5), whichever model answered. */
const normalise = (intake: Intake): Intake => (intake.is_urgent ? { ...intake, priority: 1 } : intake);

export async function analyzeComplaint(input: { text: string; images: string[]; locationName?: string }): Promise<IntakeResult> {
  const started = Date.now();
  const hash = createHash("sha256").update(INTAKE_PROMPT_VERSION + input.text + input.images.join("") + (input.locationName ?? "")).digest("hex");
  const hit = cache.get(hash);
  if (hit) return { ...hit, ms: Date.now() - started };

  // Go engine first; its own fallback means every model it tried failed, so give the web router a turn.
  const remote = await engineFetch("/v1/intake", input, EngineIntakeSchema);
  if (remote && remote.source === "ai") {
    const result: IntakeResult = { ...remote, intake: normalise(remote.intake), via: "engine", ms: Date.now() - started };
    cache.set(hash, result);
    return result;
  }

  const content = [
    { type: "text" as const, text: `Complaint text: ${input.text || "(no text, photo only)"}${input.locationName ? `\nSelected location: ${input.locationName}` : ""}` },
    ...input.images.map((url) => ({ type: "image" as const, image: url })),
  ];

  const ask = (strict: boolean) =>
    runAI("intake", async ({ languageModel, abortSignal }) => {
      const { output } = await generateText({
        model: languageModel(),
        system: intakeSystem(strict),
        messages: [{ role: "user", content }],
        output: Output.object({ schema: IntakeSchema }),
        abortSignal,
      });
      return output;
    }, { requireCaps: input.images.length ? ["vision"] : [] });

  try {
    let r = await ask(false);
    if (hasBengaliDrift(r.result.title_as + r.result.summary_as)) {
      const retry = await ask(true);
      r = { ...retry, attempts: [...r.attempts, ...retry.attempts] };
    }
    const result: IntakeResult = { intake: normalise(r.result), source: "ai", via: "web", model: r.model, attempts: r.attempts, ms: Date.now() - started };
    cache.set(hash, result);
    return result;
  } catch (e) {
    const attempts = e instanceof AIUnavailableError ? e.attempts : [];
    return { intake: fallbackIntake(input.text), source: "fallback", via: "web", attempts, ms: Date.now() - started };
  }
}

/** 768-dim multilingual embedding of the English summary → cross-lingual duplicate search. */
export async function embedText(text: string): Promise<number[] | null> {
  try {
    const { result } = await runAI("embed", async ({ embeddingModel, abortSignal }) => {
      const { embedding } = await embed({
        model: embeddingModel(),
        value: text,
        abortSignal,
        providerOptions: { google: { outputDimensionality: 768, taskType: "SEMANTIC_SIMILARITY" } },
      });
      return embedding;
    });
    return result;
  } catch {
    return null; // dedup is skipped; retry job fills it later
  }
}
