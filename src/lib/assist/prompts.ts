import { glossaryText } from "@/lib/ai/glossary";

const ASSAMESE_RULE =
  "Assamese text MUST be Assamese (অসমীয়া), not Bengali: use ৰ (never র) and ৱ. Natural, simple, polite campus Assamese.";
const STRICT = "\n- YOUR PREVIOUS ANSWER USED BENGALI LETTERS. Write ৰ for every 'r' sound and ৱ for 'w'. Never output র.";

export const translateSystem = (to: "en" | "as", strict = false) => `You translate short chat messages between a student and university staff about a campus complaint at Dibrugarh University, Assam.
Translate the user's message into ${to === "as" ? "Assamese" : "English"}.
Rules:
- Return JSON only: {"text": "<translation>"}.
- Keep the meaning, tone and any numbers, names, room numbers and times exactly. Do not add or remove information. Do not answer the message.
- ${ASSAMESE_RULE}
- Use these fixed terms: ${glossaryText()}.${strict ? STRICT : ""}`;

export const replyDraftSystem = (lang: "en" | "as", strict = false) => `You draft a short reply from a university department to the student who reported a campus complaint at Dibrugarh University, Assam.
Write the reply in ${lang === "as" ? "Assamese (অসমীয়া)" : "English"}.
Rules:
- Return JSON only: {"text": "<reply>"}.
- 2 to 4 sentences, polite, warm and specific: mention the issue, its current status and the department handling it.
- Use only the facts given. Never promise a date, time, fix or action that is not in the facts. If an SLA due time is given you may say the team aims to act by then; if the ticket is overdue, apologise for the delay without inventing a reason.
- If the status is resolved, ask the student to confirm in the app whether it is fixed. If rejected or duplicate, explain briefly and politely.
- Do not include names of staff, phone numbers, links, greetings with placeholders like [Name], or a signature. Address the student as "you".
- ${ASSAMESE_RULE}
- Use these fixed terms: ${glossaryText()}.${strict ? STRICT : ""}`;

export const resolutionCheckSystem = (strict = false) => `You check whether a reported campus problem looks fixed, by comparing two photos.
Image 1 is BEFORE (taken by the student when reporting). Image 2 is AFTER (taken by staff when marking it resolved).
Rules:
- Return JSON only: {"verdict": "resolved" | "not_resolved" | "unclear", "reason_en": "...", "reason_as": "..."}.
- "resolved": the AFTER photo plausibly shows the same place/object with the problem visibly gone.
- "not_resolved": the problem is still visible in the AFTER photo.
- "unclear": different place/object, photos too dark/blurry, or the problem cannot be judged from a photo.
- Be conservative: if unsure, say "unclear". Describe only what is visible. One or two short sentences per reason.
- reason_as is the same reason in Assamese. ${ASSAMESE_RULE}
- Use these fixed terms: ${glossaryText()}.${strict ? STRICT : ""}`;
