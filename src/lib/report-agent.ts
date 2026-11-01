import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { generateText, Output } from "ai";
import { z } from "zod";
import { CATEGORIES, LocationItemSchema, MAX_PHOTOS, type LocationItem } from "@/lib/domain";
import { runAI } from "@/lib/ai/router";
import { fallbackIntake } from "@/lib/ai/fallback";
import { glossaryText } from "@/lib/ai/glossary";
import { hasBengaliDrift, isAssameseText } from "@/lib/utils";

/*
 * "Tell Civi what happened" — a short chat that turns a student's words into a report draft.
 * One intake-chain model call per turn. Civi asks at most MAX_QUESTIONS follow-ups, then always drafts.
 * Civi never submits: the student reviews the draft and submits it through POST /api/complaints.
 */

export const MAX_QUESTIONS = 2;
export const MAX_TURNS = 12;
export const MAX_TURN_CHARS = 1000;

const PHOTO_PATH = /^[0-9a-f-]{36}\/[0-9a-f-]{36}\.(jpg|png|webp)$/;
const BUCKET = "complaint-photos";

export const ReportAgentRequestSchema = z.object({
  messages: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().trim().max(MAX_TURN_CHARS) }))
    .min(1)
    .max(MAX_TURNS)
    .refine((m) => m[m.length - 1]?.role === "user", { message: "The last message must be the student's" }),
  photo_paths: z.array(z.string().regex(PHOTO_PATH, "invalid photo path")).max(MAX_PHOTOS).default([]),
  location_id: z.guid().nullish(),
  locale: z.enum(["en", "as"]).default("en"),
});
export type ReportAgentRequest = z.infer<typeof ReportAgentRequestSchema>;

export const NEEDS = ["location", "details", "photo"] as const;

export const ReportDraftSchema = z.object({
  text: z.string().min(1).max(2000).describe("Clean description of the problem in the student's own words and language. Only facts the student gave."),
  location_query: z.string().max(120).nullable().describe("Building or place the student named (as written), else null"),
  location_note: z.string().max(200).nullable().describe("Where exactly inside the place (floor, room, near what), else null"),
  category: z.enum(CATEGORIES),
  priority: z.number().int().min(1).max(4).describe("1 critical (safety/health risk), 2 high, 3 medium, 4 low"),
  title_en: z.string().min(3).max(90).describe("Short English title"),
  title_as: z.string().min(3).max(120).describe("Short Assamese title using ৰ and ৱ"),
  summary_en: z.string().min(10).max(400).describe("1-2 sentence English summary"),
  summary_as: z.string().min(10).max(500).describe("Same summary in Assamese"),
  is_urgent: z.boolean().describe("Immediate danger to people right now"),
  is_sensitive_suggested: z.boolean().describe("Harassment, threats or personal matter only admins should see"),
});
export type ReportDraft = z.infer<typeof ReportDraftSchema>;

const ModelTurnSchema = z.object({
  reply: z.string().min(1).max(600).describe("What Civi says to the student, in the reply language. One or two short sentences."),
  need: z.enum(NEEDS).nullable().describe("What the follow-up question asks for; null when a draft is returned"),
  draft: ReportDraftSchema.nullable().describe("The report draft, or null while asking a question"),
});

export type ReportAgentResult = {
  /** Civi's message. Empty when AI was down or garbled: the client shows a localised line for `need` instead. */
  reply: string;
  need: (typeof NEEDS)[number] | null;
  draft: ReportDraft | null;
  /** Best matching campus locations for the draft (chosen one first when `location_id` was sent). */
  locations: LocationItem[];
  /** The place Civi is confident about (chosen, named, or the student's own hostel); the client pre-selects it. */
  picked_location_id: string | null;
  questions_asked: number;
  is_urgent: boolean;
  source: "ai" | "fallback";
  model?: string;
};

function systemPrompt(o: {
  replyLang: "en" | "as"; asked: number; mustDraft: boolean; photos: number; location: string | null; placeKnown: boolean;
  homeHostel: string | null; strict: boolean;
}) {
  return `You are Civi, the friendly helper of CivicSense at Dibrugarh University, Assam. A student is telling you about a campus problem.
Your job: understand the problem, ask at most ${MAX_QUESTIONS} short follow-up questions in total, then return a report draft.
You never submit anything; the student reviews the draft and submits it.

Reply language: ${o.replyLang === "as" ? "Assamese (অসমীয়া script, use ৰ and ৱ, never Bengali র; polite আপুনি form)" : "English"}.
Questions already asked: ${o.asked} of ${MAX_QUESTIONS}.
Photos attached by the student: ${o.photos}.
Location already chosen by the student: ${o.location ?? "none"}.
${o.homeHostel ? `The student's own hostel (from their profile): ${o.homeHostel}. When they say "my hostel", "our hostel" or just "hostel" without naming one, it means this hostel: use it as draft.location_query and do not ask which hostel.\n` : ""}Specific campus building named so far: ${o.location || o.placeKnown ? "yes" : "NO (only a generic place or none). If you still may ask, your question must be which building/hostel exactly (need = \"location\")"}.

Rules:
- ${o.mustDraft ? "You MUST return a draft now (need = null). Do not ask another question." : "Ask ONE short question only if something important is missing: where exactly (if no place is known), since when / how bad (if the problem is vague), or a photo (only if a photo would clearly help and none is attached). A generic place without a name (\"hostel\", \"washroom\", \"my department\") counts as missing: ask which one. Otherwise return the draft right away."}
- If the problem sounds like immediate danger (fire, smoke, injury, violence, threats, medical emergency, live wires): do not ask anything, return the draft with is_urgent = true and priority 1, and tell the student to call campus security now. Never claim that help has been sent.
- When asking, set need to "location", "details" or "photo", and draft to null. Keep the question under 20 words and friendly.
- When drafting, set need to null. reply = one short sentence asking the student to check the draft and tap Submit.
- draft.text: a clean, complete description using ONLY what the student said (merge their answers in). Keep their language. Never invent facts, places, times or numbers.
- draft.location_query: the building or place exactly as the student named it, else null. draft.location_note: floor/room/landmark detail, else null.
- category is one of: ${CATEGORIES.join(", ")}.
- priority: 1 = safety/health risk now; 2 = blocks daily life (e.g. no water in a hostel); 3 = inconvenient; 4 = cosmetic.
- is_sensitive_suggested: harassment, threats, stalking, ragging, abuse, personal safety or mental health.
- If the message is not a campus problem at all, say kindly that you can only help with campus issues and ask what is wrong (need = "details").
- Assamese text must be Assamese, not Bengali: use ৰ and ৱ. Fixed terms: ${glossaryText()}.${
    o.strict ? "\n- PREVIOUS ANSWER USED BENGALI LETTERS. Rewrite every Assamese word with ৰ for 'r' and ৱ for 'w'. Never output র." : ""
  }
Return JSON only, matching the schema.`;
}

/** Degenerate model output (stray Greek/Cyrillic, a word repeated over and over) is never shown to a student. */
const looksBroken = (s: string) => /[Ͱ-ӿ]/.test(s) || /(\S+)(\s+\1){3,}/u.test(s);

/** Same safety net as intake: a stray Bengali র becomes the Assamese ৰ after the strict retry. */
const fixRa = (s: string) => s.replace(/র/g, "ৰ");

async function loadImages(supabase: SupabaseClient, paths: string[]): Promise<string[]> {
  const out = await Promise.all(
    paths.map(async (p) => {
      const { data, error } = await supabase.storage.from(BUCKET).download(p);
      if (error || !data) return null;
      const mime = data.type?.startsWith("image/") ? data.type : p.endsWith(".png") ? "image/png" : p.endsWith(".webp") ? "image/webp" : "image/jpeg";
      return `data:${mime};base64,${Buffer.from(await data.arrayBuffer()).toString("base64")}`;
    }),
  );
  return out.filter((u): u is string => u !== null);
}

// ---------- location matching ----------

const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}\p{M}\s]/gu, " ").replace(/\s+/g, " ").trim();
const STOP = new Set(["the", "of", "near", "at", "in", "on", "to", "and", "floor", "room", "block", "building", "campus", "university", "du"]);

/** Ranks campus locations against free text in English or Assamese. Returns the best `limit` with any overlap. */
/** Words that name a kind of place, not one place: on their own they never pin down a building. */
const GENERIC = new Set([
  "hostel", "hostels", "washroom", "bathroom", "toilet", "toilets", "canteen", "mess", "gate", "department", "dept", "centre", "center",
  "office", "library", "park", "ground", "playground", "class", "classroom", "lab", "road", "girls", "boys", "ladies", "gents", "my", "our",
  "হোষ্টেল", "হোষ্টেলৰ", "বাথৰুম", "বাথৰুমত", "শৌচাগাৰ", "কেণ্টিন", "মেছ", "দুৱাৰ", "বিভাগ", "বিভাগত", "কেন্দ্ৰ", "কাৰ্যালয়", "ছাত্ৰাবাস", "শ্ৰেণী", "পথ",
]);

/**
 * Ranks campus locations against free text in English or Assamese. Returns the best `limit` with any overlap.
 * `specificOnly`: ignore generic words ("hostel", "library") so a match means a named place was given.
 */
export function rankLocations(all: LocationItem[], query: string, limit = 3, specificOnly = false): LocationItem[] {
  const q = norm(query);
  if (!q) return [];
  const tokens = q.split(" ").filter((t) => (t.length >= 3 || isAssameseText(t)) && !STOP.has(t) && !(specificOnly && GENERIC.has(t)));
  const scored = all.map((l) => {
    const names = [norm(l.name_en), norm(l.name_as)];
    let score = 0;
    let coverage = 0;
    for (const n of names) {
      if (!n) continue;
      if (n === q) score += 10;
      else if (q.includes(n) || (!specificOnly && n.includes(q))) score += 5;
      const words = n.split(" ").filter((w) => !STOP.has(w) && w !== "for");
      let hit = 0;
      for (const t of tokens) {
        if (words.includes(t)) { score += 2; hit++; }
        else if (words.some((w) => w.startsWith(t) || (t.startsWith(w) && w.length >= 3))) { score += 1; hit++; }
      }
      // Tie-break: a short name mostly covered by the query beats a long name that shares one word.
      if (words.length) coverage = Math.max(coverage, hit / words.length);
    }
    return { l, score: score > 0 ? score + coverage : 0 };
  });
  const ranked = scored.filter((s) => s.score > 0).sort((a, b) => b.score - a.score);
  // Drop weak tails ("Department of Physics" should not also suggest every other department).
  const top = ranked[0]?.score ?? 0;
  return ranked.filter((s) => s.score >= top * 0.6).slice(0, limit).map((s) => s.l);
}

const HOSTEL_WORD = /hostel|হোষ্টেল|হোস্টেল|ছাত্ৰাবাস|ছাত্ৰীনিবাস/i;

async function loadLocations(supabase: SupabaseClient): Promise<LocationItem[]> {
  const { data, error } = await supabase.from("locations").select("id, name_en, name_as, type").order("name_en");
  if (error) return [];
  const parsed = LocationItemSchema.array().safeParse(data ?? []);
  return parsed.success ? parsed.data : [];
}

// ---------- the turn ----------

function fallbackDraft(userText: string): ReportDraft {
  const fb = fallbackIntake(userText);
  return {
    text: userText.slice(0, 2000) || fb.summary_en,
    location_query: null,
    location_note: null,
    category: fb.category,
    priority: fb.priority,
    title_en: fb.title_en,
    title_as: fb.title_as,
    summary_en: fb.summary_en,
    summary_as: fb.summary_as,
    is_urgent: fb.is_urgent,
    is_sensitive_suggested: fb.is_sensitive_suggested,
  };
}

export async function runReportAgentTurn(supabase: SupabaseClient, userId: string, input: ReportAgentRequest): Promise<ReportAgentResult> {
  if (input.photo_paths.some((p) => !p.startsWith(`${userId}/`))) {
    throw Object.assign(new Error("Photos must be your own uploads"), { code: "VALIDATION_ERROR" });
  }
  // An empty student turn is a photo sent without words; an empty Civi turn never reaches the model.
  const messages = input.messages.filter((m) => m.role === "user" || m.content.length > 0);
  const userTurns = messages.filter((m) => m.role === "user");
  const userText = userTurns.map((m) => m.content).join("\n").trim();
  const lastUser = userTurns[userTurns.length - 1]?.content ?? "";
  const asked = messages.filter((m) => m.role === "assistant").length;
  const replyLang: "en" | "as" = isAssameseText(lastUser) ? "as" : /[a-z]/i.test(lastUser) ? "en" : input.locale;

  // Deterministic keywords can only add caution: danger words skip the questions (PRD rule 5).
  const kw = fallbackIntake(userText);
  const mustDraft = asked >= MAX_QUESTIONS || kw.is_urgent || messages.length >= MAX_TURNS - 1;

  const [allLocations, images] = await Promise.all([
    loadLocations(supabase),
    input.photo_paths.length ? loadImages(supabase, input.photo_paths) : Promise.resolve([]),
  ]);
  const chosen = input.location_id ? (allLocations.find((l) => l.id === input.location_id) ?? null) : null;
  // Deterministic hint so even a small model asks "which hostel?" instead of drafting a placeless report.
  const placeKnown = rankLocations(allLocations, userText, 1, true).length > 0;
  // "No water in my hostel": the profile already says which hostel, so Civi should not ask again.
  const { data: me } = await supabase.from("profiles").select("hostel").eq("id", userId).maybeSingle();
  const homeHostel = (me as { hostel?: string | null } | null)?.hostel?.trim() || null;
  const usesHomeHostel = Boolean(homeHostel) && !placeKnown && HOSTEL_WORD.test(userText);

  const history = messages.map((m, i) =>
    m.role === "user" && i === messages.length - 1 && images.length
      ? { role: "user" as const, content: [{ type: "text" as const, text: m.content || "(photo only)" }, ...images.map((image) => ({ type: "image" as const, image }))] }
      : { role: m.role, content: m.content || "(photo only)" },
  );

  const ask = (strict: boolean) =>
    runAI(
      "intake",
      async ({ languageModel, abortSignal }) => {
        const { output } = await generateText({
          model: languageModel(),
          system: systemPrompt({ replyLang, asked, mustDraft, photos: images.length, location: chosen ? `${chosen.name_en} (${chosen.name_as})` : null, placeKnown: placeKnown || usesHomeHostel, homeHostel, strict }),
          messages: history,
          output: Output.object({ schema: ModelTurnSchema }),
          abortSignal,
        });
        return output;
      },
      { requireCaps: images.length ? ["vision"] : [] },
    );

  let source: "ai" | "fallback" = "ai";
  let model: string | undefined;
  let turn: z.infer<typeof ModelTurnSchema>;
  try {
    let r = await ask(false);
    const asText = (t: typeof r.result) => (replyLang === "as" ? t.reply : "") + (t.draft ? t.draft.title_as + t.draft.summary_as : "");
    if (hasBengaliDrift(asText(r.result)) || looksBroken(r.result.reply)) r = await ask(true);
    turn = r.result;
    if (looksBroken(turn.reply)) turn = { ...turn, reply: "" }; // the client shows its localised line for `need`
    model = r.model;
  } catch {
    // Every model failed: one canned question about the place, then a keyword draft. The client localises the line.
    source = "fallback";
    const needPlace = asked === 0 && !chosen && !placeKnown && !usesHomeHostel && !mustDraft;
    turn = { reply: "", need: needPlace ? "location" : null, draft: needPlace ? null : fallbackDraft(userText) };
  }

  let draft = turn.draft;
  if (!draft && mustDraft) draft = fallbackDraft(userText);
  if (draft && usesHomeHostel && (!draft.location_query || !rankLocations(allLocations, draft.location_query, 1, true).length)) {
    draft = { ...draft, location_query: homeHostel };
  }
  if (draft) {
    const urgent = draft.is_urgent || kw.is_urgent;
    draft = {
      ...draft,
      title_as: fixRa(draft.title_as),
      summary_as: fixRa(draft.summary_as),
      is_urgent: urgent,
      priority: urgent ? 1 : draft.priority,
      is_sensitive_suggested: draft.is_sensitive_suggested || kw.is_sensitive_suggested,
    };
  }
  const reply = replyLang === "as" ? fixRa(turn.reply) : turn.reply;
  const need = draft ? null : (turn.need ?? "details");

  let locations: LocationItem[] = [];
  let picked: string | null = null;
  if (draft) {
    // The named place first; the "where exactly" detail only when no place was named.
    // Only real names count: a generic "hostel" must not suggest every hostel on campus.
    const query = draft.location_query || draft.location_note || "";
    const ranked = query ? rankLocations(allLocations, query, 3, true) : [];
    const home = usesHomeHostel && homeHostel ? (rankLocations(allLocations, homeHostel, 1, true)[0] ?? null) : null;
    const first = chosen ?? (ranked.length === 1 ? ranked[0] : null) ?? (ranked.length ? null : home);
    picked = first?.id ?? null;
    locations = first ? [first, ...ranked.filter((l) => l.id !== first.id)].slice(0, 3) : ranked;
  }

  return {
    reply,
    need,
    draft,
    locations,
    picked_location_id: picked,
    questions_asked: draft ? asked : asked + 1,
    is_urgent: Boolean(draft?.is_urgent || kw.is_urgent),
    source,
    model,
  };
}
