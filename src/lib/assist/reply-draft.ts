import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { generateText, Output } from "ai";
import { z } from "zod";
import { OPEN_STATUSES, type Status } from "@/lib/domain";
import { PipelineError } from "@/lib/complaints";
import { AIUnavailableError, runAI } from "@/lib/ai/router";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadTicketForManager, withAssameseGuard, type Actor, type AssistTicket } from "./access";
import { replyDraftSystem } from "./prompts";
import type { ChatLang, ReplyDraft } from "./types";

const DraftSchema = z.object({ text: z.string().trim().min(10).max(1500) });

/** The reporter's language: the language they wrote the complaint in, else their profile preference. */
async function reporterLang(ticket: AssistTicket): Promise<ChatLang> {
  if (ticket.original_lang === "as" || ticket.original_lang === "en") return ticket.original_lang;
  if (!ticket.user_id) return "en";
  const { data } = await createAdminClient().from("profiles").select("lang_pref").eq("id", ticket.user_id).maybeSingle();
  return (data as { lang_pref?: string } | null)?.lang_pref === "as" ? "as" : "en";
}

/** Plain-language status so the model never translates the enum literally. */
const STATUS_TEXT: Record<Status, string> = {
  submitted: "received, waiting to be reviewed",
  triaged: "reviewed and sent to the department",
  needs_review: "being reviewed by an admin",
  assigned: "assigned to a staff member",
  in_progress: "staff are working on it",
  resolved: "marked as fixed by staff, waiting for the student to confirm in the app",
  closed: "closed after the student confirmed",
  duplicate: "merged with an earlier report of the same problem",
  rejected: "rejected by an admin",
};

const fmtTime = (iso: string) =>
  new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" }).format(new Date(iso));

async function factsFor(supabase: SupabaseClient, ticket: AssistTicket, lang: ChatLang): Promise<string> {
  const { data: msgs } = await supabase
    .from("messages")
    .select("body, sender_id, created_at")
    .eq("complaint_id", ticket.id)
    .eq("internal", false)
    .order("created_at", { ascending: false })
    .limit(6);
  const recent = ((msgs ?? []) as { body: string; sender_id: string | null }[])
    .reverse()
    .map((m) => `${m.sender_id && m.sender_id === ticket.user_id ? "Student" : "Staff"}: ${m.body.slice(0, 300)}`);
  const open = (OPEN_STATUSES as readonly Status[]).includes(ticket.status);
  const overdue = open && ticket.sla_due_at ? new Date(ticket.sla_due_at).getTime() < Date.now() : false;
  const dept = ticket.department ? (lang === "as" ? ticket.department.name_as : ticket.department.name_en) : null;
  return [
    `Ticket: ${ticket.code}`,
    `Title: ${(lang === "as" ? ticket.title_as : ticket.title_en) || ticket.title_en || ticket.title_as || "-"}`,
    `Summary: ${(lang === "as" ? ticket.summary_as : ticket.summary_en) || ticket.summary_en || "-"}`,
    `Category: ${ticket.category}`,
    `Priority: P${ticket.priority}`,
    `Status: ${STATUS_TEXT[ticket.status] ?? ticket.status}`,
    `Department: ${dept ?? "not yet assigned"}`,
    `Field staff assigned: ${ticket.assignee_id ? "yes" : "no"}`,
    open && ticket.sla_due_at ? `SLA due: ${fmtTime(ticket.sla_due_at)} (${overdue ? "OVERDUE" : "on time"})` : null,
    ticket.resolution_note_en || ticket.resolution_note_as
      ? `Resolution note: ${(lang === "as" ? ticket.resolution_note_as : ticket.resolution_note_en) || ticket.resolution_note_en}`
      : null,
    recent.length ? `Recent chat:\n${recent.join("\n")}` : "Recent chat: none",
  ]
    .filter(Boolean)
    .join("\n");
}

export async function draftReply(supabase: SupabaseClient, actor: Actor, idOrCode: string): Promise<ReplyDraft> {
  const started = Date.now();
  const ticket = await loadTicketForManager(supabase, actor, idOrCode);
  const lang = await reporterLang(ticket);
  const facts = await factsFor(supabase, ticket, lang);
  const ask = (strict: boolean) =>
    runAI("reply_draft", async ({ languageModel, abortSignal }) => {
      const { output } = await generateText({
        model: languageModel(),
        system: replyDraftSystem(lang, strict),
        prompt: `Facts:\n${facts}\n\nWrite the reply now.`,
        output: Output.object({ schema: DraftSchema }),
        abortSignal,
      });
      return output;
    });
  try {
    const r = await withAssameseGuard(
      lang === "as",
      ask,
      (x) => x.result.text,
      (x, replace) => ({ ...x, result: { text: replace(x.result.text) } }),
    );
    return { text: r.result.text, lang, model: r.model, ms: Date.now() - started };
  } catch (e) {
    if (e instanceof AIUnavailableError) throw new PipelineError("AI_UNAVAILABLE", "The AI could not draft a reply right now — try again or write it yourself");
    throw e;
  }
}
