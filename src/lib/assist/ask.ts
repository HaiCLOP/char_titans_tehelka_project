import "server-only";
import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { generateText, Output } from "ai";
import { z } from "zod";
import { PipelineError } from "@/lib/complaints";
import { AIUnavailableError, runAI } from "@/lib/ai/router";
import { retrieveTickets } from "@/lib/rag";
import { cacheGet, cacheSet } from "@/lib/redis";
import { withAssameseGuard } from "./access";
import type { ChatLang } from "./types";

/**
 * "Ask Civi": the floating mascot answers a student's question about CivicSense or campus issues. Grounded in a
 * short guide to the app, the asker's own recent reports and the closest past public tickets (RAG, sensitive
 * reports are never retrieved). Answers come back in the question's language with an optional next step the
 * UI turns into a button. Generic answers (no personal reports involved) are cached in Redis for a day.
 */

export const ASK_ACTIONS = ["report_chat", "report", "my", "map", "pulse", "none"] as const;
export const AskRequestSchema = z.object({ question: z.string().trim().min(2).max(400) });
export const AskAnswerSchema = z.object({
  answer: z.string(),
  lang: z.enum(["en", "as"]),
  action: z.enum(ASK_ACTIONS),
  sources: z.array(z.object({ code: z.string(), title: z.string() })),
});
export type AskAnswer = z.infer<typeof AskAnswerSchema>;

const ModelSchema = z.object({ answer: z.string().trim().min(2).max(900), action: z.enum(ASK_ACTIONS) });

const GUIDE = `CivicSense is Dibrugarh University's campus issue tracker. Students report problems (water, electricity, cleanliness, hostel, roads, safety, internet and more) in Assamese or English.
- "Tell Civi" (/report/chat): describe the problem in a chat, Civi fills the report and the student reviews it before submitting. Nothing is filed without the student's tap.
- Report form (/report): text, up to 3 photos, location, Public/Private, Anonymous, Sensitive (harassment or personal safety: only admins see it).
- AI writes a title and summary in both languages, picks the category and priority and routes it to the right department with an SLA deadline.
- If the same issue was already reported (even in the other language) the student can tap "Me too" instead of filing again.
- My reports (/my): live status: submitted, triaged, assigned, in progress, resolved, closed. Notifications arrive when anything changes.
- When staff mark it resolved, the student confirms "Fixed" with a 1-5 star rating, or "Not fixed" to send it back. A closed report can be reopened within 7 days.
- Campus map (/map) shows public issues by building. Campus Pulse (/pulse) shows resolution times and trends.
- Emergencies (fire, injury, violence, medical): call campus security or emergency services immediately; the app shows the numbers but does not dispatch help.`;

const system = (lang: ChatLang, strict: boolean) => `You are Civi, the friendly guide inside CivicSense at Dibrugarh University, Assam.
Answer the student's question in ${lang === "as" ? "Assamese (অসমীয়া)" : "English"}, in 1 to 4 short sentences. Be warm and plain.
Use ONLY the guide, the student's reports and the past tickets below. If they do not answer the question, say you are not sure and suggest what the student can do in the app. Never invent ticket codes, numbers, names or deadlines.
If someone may be in danger, tell them to contact campus security or emergency services first.
Pick "action" as the most useful next step: report_chat (they want to report something), report (they want the full form), my (about their reports), map, pulse, or none.${
  lang === "as"
    ? `\nWrite proper Assamese: use ৰ and ৱ, never the Bengali letter র.${strict ? " Your last answer used র. That is wrong. Use ৰ." : ""}`
    : ""
}`;

const detectLang = (s: string): ChatLang => (/[ঀ-৿]/.test(s) ? "as" : "en");
const PERSONAL = /\b(my|mine|i|me)\b|মোৰ|মই|মোক/i;
const hash = (s: string) => createHash("sha256").update(s.trim().toLowerCase().replace(/\s+/g, " ")).digest("hex").slice(0, 32);

type OwnRow = { code: string; title_en: string | null; title_as: string | null; status: string; created_at: string };

export async function askCivi(supabase: SupabaseClient, userId: string, question: string): Promise<AskAnswer> {
  const lang = detectLang(question);
  const personal = PERSONAL.test(question);
  const cacheKey = `cs:ask:v1:${lang}:${hash(question)}`;
  if (!personal) {
    const hit = AskAnswerSchema.safeParse(await cacheGet(cacheKey));
    if (hit.success) return hit.data;
  }

  const [ownRes, past] = await Promise.all([
    supabase
      .from("complaints")
      .select("code, title_en, title_as, status, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(5),
    retrieveTickets(supabase, question, null, 4),
  ]);
  const own = (ownRes.data ?? []) as OwnRow[];
  const pick = (en: string | null, as: string | null) => (lang === "as" ? as || en : en || as) ?? "-";

  const facts = [
    `Guide:\n${GUIDE}`,
    own.length
      ? `Student's recent reports:\n${own.map((r) => `- ${r.code}: ${pick(r.title_en, r.title_as)} (status: ${r.status})`).join("\n")}`
      : "Student's recent reports: none",
    past.length
      ? `Similar past tickets:\n${past
          .map((p) => `- ${p.code}: ${pick(p.title_en, p.title_as)} at ${pick(p.location_en, p.location_as)}, status ${p.status}${
              p.resolution_note_en || p.resolution_note_as ? `, fixed by: ${pick(p.resolution_note_en, p.resolution_note_as)}` : ""
            }`)
          .join("\n")}`
      : "Similar past tickets: none",
  ].join("\n\n");

  const ask = (strict: boolean) =>
    runAI("agent", async ({ languageModel, abortSignal }) => {
      const { output } = await generateText({
        model: languageModel(),
        system: system(lang, strict),
        prompt: `${facts}\n\nQuestion: ${question}`,
        output: Output.object({ schema: ModelSchema }),
        abortSignal,
      });
      return output;
    });

  try {
    const r = await withAssameseGuard(
      lang === "as",
      ask,
      (x) => x.result.answer,
      (x, replace) => ({ ...x, result: { ...x.result, answer: replace(x.result.answer) } }),
    );
    const answer: AskAnswer = {
      answer: r.result.answer,
      lang,
      action: r.result.action,
      sources: past.slice(0, 3).map((p) => ({ code: p.code, title: pick(p.title_en, p.title_as) })),
    };
    if (!personal) await cacheSet(cacheKey, answer, 86_400);
    return answer;
  } catch (e) {
    if (e instanceof AIUnavailableError) throw new PipelineError("AI_UNAVAILABLE", "Civi can't answer right now. Try again in a moment.");
    throw e;
  }
}
