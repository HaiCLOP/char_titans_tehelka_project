import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { runAI } from "@/lib/ai/router";
import { generateText, Output } from "ai";
import { z } from "zod";

export type DailyBrief = {
  bullets_en: string[];
  bullets_as: string[];
  generated_at: string;
};

const BriefSchema = z.object({
  bullets_en: z.array(z.string().max(200)).length(3),
  bullets_as: z.array(z.string().max(250)).length(3),
});

let cachedBrief: { data: DailyBrief; expiresAt: number } | null = null;
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes cache

function buildFallbackBrief(stats: { open: number; in_progress: number; resolved: number } | null): DailyBrief {
  const open = stats?.open ?? 0;
  const inProg = stats?.in_progress ?? 0;
  const fixed = stats?.resolved ?? 0;

  const bullets_en = [
    open > 0
      ? `${open} campus issue${open > 1 ? "s are" : " is"} currently active; field teams are prioritizing water and electrical infrastructure.`
      : "Campus infrastructure is operating normally with all major utilities functional.",
    inProg > 0
      ? `${inProg} ticket${inProg > 1 ? "s are" : " is"} actively undergoing maintenance by campus technicians.`
      : `${fixed} issue${fixed !== 1 ? "s have" : " has"} been resolved with positive feedback from reporters.`,
    "CivicSense AI verification and SLA monitoring are active across all university departments.",
  ];

  const bullets_as = [
    open > 0
      ? `চৌহদত বৰ্তমান ${open} টা সমস্যা সক্ৰিয় হৈ আছে; পানী আৰু বিদ্যুৎ ব্যৱস্থাক অগ্ৰাধিকাৰ দিয়া হৈছে।`
      : "বিশ্ববিদ্যালয় চৌহদৰ সকলো গুৰুত্বপূৰ্ণ সেৱা স্বাভাৱিকভাৱে চলি আছে।",
    inProg > 0
      ? `${inProg} টা অভিযোগৰ মেৰামতি কাৰ্য প্ৰযুক্তি কৰ্মীৰ দ্বাৰা চলি আছে।`
      : `সম্প্ৰতি ${fixed} টা সমস্যা সফলতাৰে সমাধান কৰা হৈছে।`,
    "সকলো বিভাগতে চিভিকশ্বিল্ড এআই সত্যতা নিৰীক্ষণ আৰু এছএলএ নিৰীক্ষণ সক্ৰিয় হৈ আছে।",
  ];

  return {
    bullets_en,
    bullets_as,
    generated_at: new Date().toISOString(),
  };
}

export async function getCampusDailyBrief(
  supabase: SupabaseClient,
  stats: { open: number; in_progress: number; resolved: number } | null,
): Promise<DailyBrief> {
  const now = Date.now();
  if (cachedBrief && cachedBrief.expiresAt > now) {
    return cachedBrief.data;
  }

  // Attempt AI generation
  try {
    const { result } = await runAI("daily_brief", async ({ languageModel, abortSignal }) => {
      const prompt = `You are the CivicSense AI Campus Intelligence Engine for Dibrugarh University.
Generate exactly 3 concise, factual daily campus brief bullet points summarizing the status:
- Open issues: ${stats?.open ?? 0}
- In progress: ${stats?.in_progress ?? 0}
- Resolved: ${stats?.resolved ?? 0}

Requirements:
1. bullets_en: Exactly 3 professional, informative English bullet points.
2. bullets_as: Exactly 3 fluent Assamese bullet points matching the meaning.
3. Crucial Assamese language rule: Use Assamese script with 'ৰ' (U+09F0) and 'ৱ' (U+09F1). NEVER use Bengali 'র' (U+09B0).`;

      const { output } = await generateText({
        model: languageModel(),
        prompt,
        output: Output.object({ schema: BriefSchema }),
        abortSignal,
      });

      return output;
    }, { timeoutMs: 4000 });

    if (result && result.bullets_en.length === 3 && result.bullets_as.length === 3) {
      const data: DailyBrief = {
        bullets_en: result.bullets_en,
        bullets_as: result.bullets_as,
        generated_at: new Date().toISOString(),
      };
      cachedBrief = { data, expiresAt: now + CACHE_TTL_MS };
      return data;
    }
  } catch (err) {
    console.warn("[daily_brief] AI brief generation fallback:", err instanceof Error ? err.message : err);
  }

  const fallback = buildFallbackBrief(stats);
  cachedBrief = { data: fallback, expiresAt: now + 5 * 60 * 1000 };
  return fallback;
}
