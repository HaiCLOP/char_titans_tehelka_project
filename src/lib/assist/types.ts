import { z } from "zod";

/*
 * M8 shared shapes (client-safe: no server imports). Ticket chat, AI reply draft, resolution photo check.
 * Kept next to the M8 code (src/lib/assist) so parallel work on src/lib/domain.ts does not conflict;
 * move into domain.ts when the branches merge.
 */

export const ChatLangSchema = z.enum(["en", "as"]);
export type ChatLang = z.infer<typeof ChatLangSchema>;

/** Who wrote a message, from the reader's point of view. Real names only for admins (never anonymous reporters). */
export const ChatSenderSchema = z.enum(["you", "staff", "reporter"]);
export type ChatSender = z.infer<typeof ChatSenderSchema>;

export const ChatMessageSchema = z.object({
  id: z.number(),
  body: z.string(),
  lang: ChatLangSchema,
  /** The body in the other language (AI). null while pending or when the AI was unavailable. */
  body_translated: z.string().nullable(),
  created_at: z.string(),
  sender: ChatSenderSchema,
  sender_name: z.string().nullable(),
});
export type ChatMessage = z.infer<typeof ChatMessageSchema>;

export const ChatThreadSchema = z.object({
  items: z.array(ChatMessageSchema),
  can_post: z.boolean(),
});
export type ChatThread = z.infer<typeof ChatThreadSchema>;

export const MESSAGE_MAX = 1000;
export const MessageRequestSchema = z.object({ body: z.string().trim().min(1).max(MESSAGE_MAX) });
export type MessageRequest = z.infer<typeof MessageRequestSchema>;

export const ReplyDraftSchema = z.object({ text: z.string(), lang: ChatLangSchema, model: z.string().optional(), ms: z.number() });
export type ReplyDraft = z.infer<typeof ReplyDraftSchema>;

export const VERDICTS = ["resolved", "not_resolved", "unclear"] as const;
export const ResolutionVerdictSchema = z.object({
  verdict: z.enum(VERDICTS),
  reason_en: z.string(),
  reason_as: z.string(),
});
export type ResolutionVerdict = z.infer<typeof ResolutionVerdictSchema>;

export const ResolutionCheckSchema = ResolutionVerdictSchema.extend({
  checked_at: z.string(),
  model: z.string().nullable().optional(),
  ms: z.number().optional(),
});
export type ResolutionCheck = z.infer<typeof ResolutionCheckSchema>;

export const ResolutionCheckStateSchema = z.object({
  result: ResolutionCheckSchema.nullable(),
  has_before: z.boolean(),
  has_after: z.boolean(),
});
export type ResolutionCheckState = z.infer<typeof ResolutionCheckStateSchema>;
