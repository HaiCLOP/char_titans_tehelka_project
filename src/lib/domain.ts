import { z } from "zod";

export const CATEGORIES = [
  "water_supply", "plumbing", "electrical", "sanitation", "hostel", "mess_food",
  "infrastructure", "it_network", "academic", "safety_security", "transport", "other",
] as const;
export type Category = (typeof CATEGORIES)[number];

export const STATUSES = [
  "submitted", "triaged", "needs_review", "assigned", "in_progress", "resolved", "closed", "duplicate", "rejected",
] as const;
export type Status = (typeof STATUSES)[number];

export const ROLES = ["student", "staff", "field_staff", "dept_admin", "super_admin"] as const;
export type Role = (typeof ROLES)[number];
export const ADMIN_ROLES = ["dept_admin", "super_admin"] as const satisfies readonly Role[];

/** Columns of `profiles` that server code reads for auth and routing. */
export type Profile = {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  role: Role;
  lang_pref: "en" | "as";
  theme: string;
  font_size: "normal" | "large";
  hostel: string | null;
  department_id: string | null;
  onboarded_at: string | null;
};

/** API error codes → HTTP status (PRD section 10). */
export const ERROR_STATUS = {
  VALIDATION_ERROR: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  INVALID_TRANSITION: 409,
  RATE_LIMITED: 429,
  INTERNAL: 500,
  AI_UNAVAILABLE: 503,
} as const;
export type ErrorCode = keyof typeof ERROR_STATUS;
export type ApiError = { error: { code: ErrorCode; message: string } };

/** What the intake model must return. Shared by API, UI preview and tests. */
export const IntakeSchema = z.object({
  title_en: z.string().min(3).max(90).describe("Short English title"),
  title_as: z.string().min(3).max(120).describe("Short Assamese title, Assamese script using ৰ and ৱ"),
  summary_en: z.string().min(10).max(400).describe("1-2 sentence English summary of the problem"),
  summary_as: z.string().min(10).max(500).describe("Same summary in Assamese"),
  category: z.enum(CATEGORIES),
  priority: z.number().int().min(1).max(4).describe("1 critical (safety/health risk), 2 high, 3 medium, 4 low"),
  priority_reason_en: z.string().max(160),
  location_hint: z.string().max(80).nullable().describe("Building/place mentioned or visible, else null"),
  is_abusive: z.boolean().describe("Abusive language or personal attacks"),
  has_personal_data: z.boolean().describe("Contains phone numbers or other personal data"),
  is_urgent: z.boolean().describe("Immediate danger to people: fire, injury, violence, threats, medical emergency"),
  is_sensitive_suggested: z.boolean().describe("Harassment, threats, safety or personal matter that only admins should see"),
  confidence: z.number().min(0).max(1),
});
export type Intake = z.infer<typeof IntakeSchema>;

export const AnalyzeRequestSchema = z.object({
  text: z.string().max(2000).default(""),
  images: z.array(z.string().startsWith("data:image/")).max(3).default([]),
  locationName: z.string().max(120).optional(),
}).refine((v) => v.text.trim().length > 0 || v.images.length > 0, { message: "text or image required" });
