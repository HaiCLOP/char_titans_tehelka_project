import "server-only";
import { embed, generateText } from "ai";
import { z } from "zod";
import { hasBengaliDrift } from "@/lib/utils";
import { AIUnavailableError, probeKeys, runAI, type KeyProbe } from "./router";
import type { AIPurpose, Attempt } from "./types";

// System panel test prompts (S21 "Test all", S22 "Test"). Tiny, bilingual, and run through the real router.

const SANITY_PROMPT =
  "Write exactly one short sentence in Assamese (Assamese script; use ৰ and ৱ, never the Bengali letter র) " +
  "telling a student that the hostel water supply has been restored. Reply with the sentence only.";

const Output = z.string().trim().min(1).max(2000);

export type PurposeTest = {
  ok: boolean; output: string | null; model: string | null; attempts: Attempt[]; ms: number;
  /** Assamese output contained Bengali র (quality gate, PRD 9). */
  bengaliDrift: boolean;
};

export async function runPurposeTest(purpose: AIPurpose): Promise<PurposeTest> {
  const started = Date.now();
  try {
    if (purpose === "embed") {
      const { result, attempts, model } = await runAI("embed", async ({ embeddingModel, abortSignal }) => {
        const { embedding } = await embed({
          model: embeddingModel(), value: "No water in the girls hostel washroom", abortSignal,
          providerOptions: { google: { outputDimensionality: 768, taskType: "SEMANTIC_SIMILARITY" } },
        });
        return z.array(z.number()).min(1).parse(embedding);
      });
      return { ok: true, output: `${result.length}-d vector`, model, attempts, ms: Date.now() - started, bengaliDrift: false };
    }
    const { result, attempts, model } = await runAI(purpose, async ({ languageModel, abortSignal }) => {
      const { text } = await generateText({ model: languageModel(), prompt: SANITY_PROMPT, maxOutputTokens: 120, abortSignal });
      return Output.parse(text);
    });
    return { ok: true, output: result, model, attempts, ms: Date.now() - started, bengaliDrift: hasBengaliDrift(result) };
  } catch (e) {
    const attempts = e instanceof AIUnavailableError ? e.attempts : [];
    return { ok: false, output: null, model: null, attempts, ms: Date.now() - started, bengaliDrift: false };
  }
}

/** "Test all" keys: one cheap generation per key. */
export function testAllKeys(): Promise<KeyProbe[]> {
  return probeKeys(async ({ languageModel, abortSignal }) => {
    const { text } = await generateText({ model: languageModel(), prompt: "Reply with the single word OK.", maxOutputTokens: 8, abortSignal });
    return Output.parse(text);
  });
}
