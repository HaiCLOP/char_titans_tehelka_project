import { z } from "zod";
import { CATEGORIES, STATUSES } from "@/lib/domain";

/*
 * "Ask CivicSense" (PRD S16, section 9) — shapes shared by the API route, the agent runner and the chat UI.
 * No server-only imports here: the client component imports the types.
 */

export const AGENT_MAX_TOOL_STEPS = 4;
export const AGENT_QUESTIONS_PER_HOUR = 30;
export const AGENT_HISTORY_TURNS = 6;

export const AgentLangSchema = z.enum(["en", "as"]);
export type AgentLang = z.infer<typeof AgentLangSchema>;

// ---------- request ----------

export const AgentRequestSchema = z.object({
  question: z.string().trim().min(2, "Ask a question").max(500, "Keep the question under 500 characters"),
  history: z
    .array(z.object({ role: z.enum(["user", "assistant"]), text: z.string().max(2000) }))
    .max(AGENT_HISTORY_TURNS * 2)
    .default([]),
  /** super_admin only: narrow the agent to one department. Ignored for dept_admin (always their own). */
  department_id: z.uuid().nullish(),
});
export type AgentRequest = z.infer<typeof AgentRequestSchema>;

// ---------- tool inputs (what the model may choose — never the department) ----------

const days = (def: number, max = 90) =>
  z.number().int().min(1).max(max).default(def).describe(`Look-back window in days ("this week" = 7, "today" = 1). Default ${def}.`);

export const StatsInput = z.object({ days: days(7) });
export const TrendInput = z.object({ days: days(14, 60) });
export const TopLocationsInput = z.object({
  days: days(7),
  category: z.enum(CATEGORIES).optional().describe("Only count complaints of this category"),
  location_type: z
    .enum(["hostel", "academic", "admin", "event", "gate", "food", "sports"])
    .optional()
    .describe('Only this kind of place, e.g. "hostel" for questions about hostels'),
});
export const ByCategoryInput = z.object({ days: days(7) });
export const DepartmentLoadInput = z.object({ days: days(7) });
export const ListComplaintsInput = z.object({
  days: days(30),
  status: z.enum([...STATUSES, "open"]).optional().describe('"open" = any not yet resolved/closed/rejected/duplicate'),
  category: z.enum(CATEGORIES).optional(),
  priority: z.number().int().min(1).max(4).optional().describe("1 = critical … 4 = low"),
  location: z.string().max(80).optional().describe("Part of a building name, English or Assamese"),
  lang: AgentLangSchema.optional().describe("Language the complaint was written in"),
  limit: z.number().int().min(1).max(20).default(10),
});
export const GetComplaintInput = z.object({
  code: z.string().trim().regex(/^CS-[A-Z0-9]{6}$/i, "Ticket codes look like CS-AB12CD").describe("Ticket code, e.g. CS-AB12CD"),
});

// ---------- tool outputs (validated before the model sees them) ----------

const count = z.number().int().nonnegative();
const Named = { name_en: z.string(), name_as: z.string() };

export const StatsOutput = z.object({
  period_days: z.number().int(),
  created_in_period: count,
  resolved_in_period: count,
  /** All unresolved tickets, including the in-progress ones. */
  open_now: count,
  in_progress_now: count,
  overdue_now: count,
  avg_resolution_hours: z.number().nullable(),
  by_language_all_time: z.object({ en: count, as: count }),
});
export const TrendOutput = z.object({
  period_days: z.number().int(),
  series: z.array(z.object({ day: z.string(), created: count, resolved: count })),
});
export const TopLocationsOutput = z.object({
  period_days: z.number().int(),
  category: z.string().nullable(),
  location_type: z.string().nullable(),
  rows: z.array(z.object({ ...Named, type: z.string().nullable(), total: count, open: count })),
  complaints_without_location: count.optional(),
});
export const ByCategoryOutput = z.object({
  period_days: z.number().int(),
  rows: z.array(z.object({ category: z.enum(CATEGORIES), label_en: z.string(), label_as: z.string(), total: count })),
});
export const DepartmentLoadOutput = z.object({
  period_days: z.number().int(),
  rows: z.array(z.object({ ...Named, total_in_period: count, open_now: count, overdue_now: count })),
});
const SafeComplaint = z.object({
  code: z.string(),
  title_en: z.string().nullable(),
  title_as: z.string().nullable(),
  category: z.enum(CATEGORIES),
  priority: z.number().int(),
  status: z.enum(STATUSES),
  location_en: z.string().nullable(),
  location_as: z.string().nullable(),
  original_lang: z.string(),
  created_at: z.string(),
});
export const ListComplaintsOutput = z.object({
  period_days: z.number().int(),
  total_matching: count,
  rows: z.array(SafeComplaint),
});
export const GetComplaintOutput = z.object({
  found: z.boolean(),
  complaint: SafeComplaint.extend({
    summary_en: z.string().nullable(),
    summary_as: z.string().nullable(),
    department_en: z.string().nullable(),
    department_as: z.string().nullable(),
    metoo_count: count,
    sla_due_at: z.string().nullable(),
    overdue: z.boolean(),
    resolved_at: z.string().nullable(),
  }).nullable(),
});

export const TOOL_NAMES = [
  "stats", "trend", "top_locations", "by_category", "department_load", "list_complaints", "get_complaint",
] as const;
export type ToolName = (typeof TOOL_NAMES)[number];

// ---------- final answer ----------

const BarRow = z.object({ label_en: z.string(), label_as: z.string(), value: count });
export const AgentChartSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("line"),
    days: z.array(z.string()),
    series: z.array(count),
    compare: z.array(count),
  }),
  z.object({ type: z.literal("bar"), tool: z.enum(TOOL_NAMES), rows: z.array(BarRow).min(1).max(8) }),
]);
export type AgentChart = z.infer<typeof AgentChartSchema>;

export const AgentTraceSchema = z.object({
  tool: z.enum(TOOL_NAMES),
  input: z.record(z.string(), z.unknown()),
  ok: z.boolean(),
  ms: z.number().int().nonnegative(),
  /** Short, language-neutral summary the UI localises: number of rows and the top row. */
  rows: count,
  top: BarRow.nullable(),
  error: z.string().optional(),
});
export type AgentTrace = z.infer<typeof AgentTraceSchema>;

export const AgentAnswerSchema = z.object({
  answer: z.string().trim().min(1),
  lang: AgentLangSchema,
  chart: AgentChartSchema.nullable(),
  trace: z.array(AgentTraceSchema).max(12),
  model: z.string(),
  ms: z.number().int().nonnegative(),
  scope: z.object({ department_en: z.string().nullable(), department_as: z.string().nullable() }),
});
export type AgentAnswer = z.infer<typeof AgentAnswerSchema>;
