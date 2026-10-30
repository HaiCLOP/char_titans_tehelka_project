import "server-only";
import { embed, generateText, Output } from "ai";
import { createHash } from "node:crypto";
import { IntakeSchema, type Intake } from "@/lib/domain";
import { hasBengaliDrift } from "@/lib/utils";
import { fallbackIntake } from "./fallback";
import { intakeSystem, INTAKE_PROMPT_VERSION } from "./prompts/intake";
import { AIUnavailableError, runAI } from "./router";
import type { Attempt } from "./types";

export type IntakeResult = { intake: Intake; source: "ai" | "fallback"; model?: string; attempts: Attempt[]; ms: number };

const cache = ((globalThis as { __intakeCache?: Map<string, IntakeResult> }).__intakeCache ??= new Map());

export async function analyzeComplaint(input: { text: string; images: string[]; locationName?: string }): Promise<IntakeResult> {
  const started = Date.now();
  const hash = createHash("sha256").update(INTAKE_PROMPT_VERSION + input.text + input.images.join("") + (input.locationName ?? "")).digest("hex");
  const hit = cache.get(hash);
  if (hit) return { ...hit, ms: Date.now() - started };

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
    const result: IntakeResult = { intake: r.result, source: "ai", model: r.model, attempts: r.attempts, ms: Date.now() - started };
    cache.set(hash, result);
    return result;
  } catch (e) {
    const attempts = e instanceof AIUnavailableError ? e.attempts : [];
    return { intake: fallbackIntake(input.text), source: "fallback", attempts, ms: Date.now() - started };
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
