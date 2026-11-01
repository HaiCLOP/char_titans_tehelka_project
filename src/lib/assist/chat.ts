import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { generateText, Output } from "ai";
import { z } from "zod";
import { PipelineError } from "@/lib/complaints";
import { runAI } from "@/lib/ai/router";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAssameseText } from "@/lib/utils";
import { loadTicket, withAssameseGuard, type Actor, type AssistTicket } from "./access";
import { hitRateLimit } from "@/lib/ratelimit";
import { translateSystem } from "./prompts";
import type { ChatLang, ChatMessage, ChatSender, ChatThread } from "./types";

/*
 * Bilingual ticket chat (S08 / S15). Non-internal messages only — internal notes (messages.internal = true)
 * live behind /api/complaints/[id]/notes and are never returned here.
 * Reads + inserts use the caller's RLS client ("messages visible with complaint" / "messages send").
 * The AI translation is written afterwards with the service role (messages has no update policy).
 */

type MessageRow = {
  id: number; body: string; lang: string; body_translated: string | null; created_at: string;
  sender_id: string | null;
  /** Set by the database; an anonymous reporter's messages carry no sender_id (migration 13). */
  from_reporter: boolean;
};
const MESSAGE_COLUMNS = "id, body, lang, body_translated, created_at, sender_id, from_reporter";

export const RATE_MAX = 20;
export const RATE_WINDOW_MS = 10 * 60_000;

const TranslationSchema = z.object({ text: z.string().trim().min(1).max(4000) });

function senderOf(row: MessageRow, actor: Actor, ticket: AssistTicket): ChatSender {
  if (row.sender_id && row.sender_id === actor.id) return "you";
  if (row.from_reporter) return ticket.user_id === actor.id ? "you" : "reporter";
  if (row.sender_id && row.sender_id === ticket.user_id) return "reporter";
  return "staff";
}

/** Names only for admins of the ticket, and never the reporter of an anonymous ticket. */
async function senderNames(rows: MessageRow[], ticket: AssistTicket, manager: boolean): Promise<Map<string, string | null>> {
  if (!manager) return new Map();
  const ids = [...new Set(rows.map((r) => r.sender_id).filter((x): x is string => Boolean(x)))]
    .filter((id) => !(ticket.anonymous && id === ticket.user_id));
  if (!ids.length) return new Map();
  const { data } = await createAdminClient().from("profiles").select("id, full_name").in("id", ids);
  return new Map(((data ?? []) as { id: string; full_name: string | null }[]).map((p) => [p.id, p.full_name]));
}

function toMessage(row: MessageRow, actor: Actor, ticket: AssistTicket, names: Map<string, string | null>): ChatMessage {
  const sender = senderOf(row, actor, ticket);
  return {
    id: row.id,
    body: row.body,
    lang: row.lang === "as" ? "as" : "en",
    body_translated: row.body_translated,
    created_at: row.created_at,
    sender,
    sender_name: sender === "you" || !row.sender_id ? null : (names.get(row.sender_id) ?? null),
  };
}

export async function listMessages(supabase: SupabaseClient, actor: Actor, idOrCode: string): Promise<ChatThread> {
  const { ticket, manager } = await loadTicket(supabase, actor, idOrCode);
  const { data, error } = await supabase
    .from("messages")
    .select(MESSAGE_COLUMNS)
    .eq("complaint_id", ticket.id)
    .eq("internal", false)
    .order("created_at", { ascending: true })
    .order("id", { ascending: true })
    .limit(200);
  if (error) {
    console.error("[chat] list failed", error.code, error.message);
    throw new PipelineError("INTERNAL", "Could not load messages");
  }
  const rows = (data ?? []) as MessageRow[];
  const names = await senderNames(rows, ticket, manager);
  return { items: rows.map((r) => toMessage(r, actor, ticket, names)), can_post: true };
}

export const detectLang = (s: string): ChatLang => (isAssameseText(s) ? "as" : "en");

/** Best effort: null when every model failed. */
export async function translateMessage(body: string, from: ChatLang): Promise<{ text: string; model: string } | null> {
  const to: ChatLang = from === "as" ? "en" : "as";
  const ask = (strict: boolean) =>
    runAI("translate_msg", async ({ languageModel, abortSignal }) => {
      const { output } = await generateText({
        model: languageModel(),
        system: translateSystem(to, strict),
        prompt: body,
        output: Output.object({ schema: TranslationSchema }),
        abortSignal,
      });
      return output;
    });
  try {
    const r = await withAssameseGuard(
      to === "as",
      ask,
      (x) => x.result.text,
      (x, replace) => ({ ...x, result: { text: replace(x.result.text) } }),
    );
    return { text: r.result.text, model: r.model };
  } catch (e) {
    console.warn("[chat] translation unavailable", e instanceof Error ? e.message : e);
    return null;
  }
}

async function notifyOtherSide(ticket: AssistTicket, actor: Actor) {
  const targets = new Set<string>();
  if (ticket.user_id && ticket.user_id !== actor.id) targets.add(ticket.user_id); // staff wrote → reporter
  if (ticket.user_id === actor.id && ticket.assignee_id) targets.add(ticket.assignee_id); // reporter wrote → assignee
  if (!targets.size) return;
  const { error } = await createAdminClient().from("notifications").insert(
    [...targets].map((user_id) => ({
      user_id,
      complaint_id: ticket.id,
      title_en: `New message on ${ticket.code}`,
      title_as: `${ticket.code} ত নতুন বাৰ্তা`,
    })),
  );
  if (error) console.warn("[chat] notification failed", error.code, error.message);
}

export type PostResult = { message: ChatMessage; translation: { ms: number; model: string | null } };

export async function postMessage(supabase: SupabaseClient, actor: Actor, idOrCode: string, body: string): Promise<PostResult> {
  const { ticket, manager } = await loadTicket(supabase, actor, idOrCode);
  if (!(await hitRateLimit(supabase, "chat", RATE_MAX, RATE_WINDOW_MS / 1000)).ok) {
    throw new PipelineError("RATE_LIMITED", "Too many messages — wait a few minutes");
  }
  const lang = detectLang(body);
  const { data, error } = await supabase
    .from("messages")
    .insert({ complaint_id: ticket.id, sender_id: actor.id, body, lang, internal: false })
    .select(MESSAGE_COLUMNS)
    .single();
  if (error || !data) {
    console.error("[chat] insert failed", error?.code, error?.message);
    throw new PipelineError("INTERNAL", "Could not send the message");
  }
  const row = data as MessageRow;

  // Translate after the insert so the other side sees the original immediately (realtime INSERT),
  // then the translation arrives as an UPDATE.
  const started = Date.now();
  // Nothing to translate (emoji, numbers, punctuation only): skip the model so it cannot invent text.
  const letters = body.replace(/[^\p{L}]/gu, "").length;
  const tr = letters >= 2 ? await translateMessage(body, lang) : null;
  const ms = Date.now() - started;
  if (tr) {
    const { error: upErr } = await createAdminClient()
      .from("messages")
      .update({ body_translated: tr.text })
      .eq("id", row.id)
      .eq("complaint_id", ticket.id);
    if (upErr) console.warn("[chat] translation save failed", upErr.code, upErr.message);
    else row.body_translated = tr.text;
  }
  await notifyOtherSide(ticket, actor);
  const names = manager ? new Map([[actor.id, actor.profile.full_name]]) : new Map<string, string | null>();
  return { message: toMessage(row, actor, ticket, names), translation: { ms, model: tr?.model ?? null } };
}
