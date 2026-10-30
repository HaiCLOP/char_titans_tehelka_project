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

// ---------- M3: report flow API contracts (PRD section 10) ----------

export const VISIBILITIES = ["public", "private"] as const;
export type Visibility = (typeof VISIBILITIES)[number];

/** Photo upload limits. The client compresses to WebP ≤ 400 KB; the API accepts up to 5 MB. */
export const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
export const MAX_PHOTOS = 3;
export const COMPLAINTS_PER_HOUR = 5;

/** `POST /api/upload` (multipart, field `file`) → */
export const UploadResultSchema = z.object({ path: z.string() });
export type UploadResult = z.infer<typeof UploadResultSchema>;

/** Storage path returned by /api/upload: `<uid>/<uuid>.<ext>` inside the complaint-photos bucket. */
const PHOTO_PATH = /^[0-9a-f-]{36}\/[0-9a-f-]{36}\.(jpg|png|webp)$/;

/** `POST /api/complaints/similar` body. */
export const SimilarRequestSchema = z.object({
  text_en: z.string().max(2000).optional(),
  summary_en: z.string().trim().min(3).max(2000),
  location_id: z.guid().nullish(),
});
export type SimilarRequest = z.infer<typeof SimilarRequestSchema>;

/** One item of the `POST /api/complaints/similar` response array (public, non-sensitive tickets only). */
export const SimilarItemSchema = z.object({
  id: z.string(),
  code: z.string(),
  title_en: z.string().nullable(),
  title_as: z.string().nullable(),
  status: z.enum(STATUSES),
  metoo_count: z.number().int(),
  similarity: z.number(),
});
export type SimilarItem = z.infer<typeof SimilarItemSchema>;

/** `POST /api/complaints` body. `intake` = the (possibly edited) AI preview; omitted ⇒ the server runs intake. */
export const SubmitComplaintSchema = z.object({
  text: z.string().max(2000).default(""),
  image_paths: z.array(z.string().regex(PHOTO_PATH, "invalid photo path")).max(MAX_PHOTOS).default([]),
  location_id: z.guid().nullish(),
  location_note: z.string().trim().max(200).nullish(),
  visibility: z.enum(VISIBILITIES).default("public"),
  anonymous: z.boolean().default(false),
  is_sensitive: z.boolean().default(false),
  intake: IntakeSchema.optional(),
  /** Where the preview came from (`source` of /api/ai/analyze). "fallback" ⇒ stored as ai_status fallback. */
  intake_source: z.enum(["ai", "fallback"]).optional(),
  intake_model: z.string().max(120).optional(),
}).refine((v) => v.text.trim().length > 0 || v.image_paths.length > 0, { message: "text or photo required" });
export type SubmitComplaintInput = z.input<typeof SubmitComplaintSchema>;

/** `POST /api/complaints` response. */
export const SubmitResultSchema = z.object({
  id: z.string(),
  code: z.string(),
  department: z.object({ id: z.string(), name_en: z.string(), name_as: z.string() }).nullable(),
  sla_due_at: z.string().nullable(),
  status: z.enum(STATUSES),
  is_urgent: z.boolean(),
});
export type SubmitResult = z.infer<typeof SubmitResultSchema>;

/** One item of `GET /api/locations?q=`. */
export const LocationItemSchema = z.object({
  id: z.string(),
  name_en: z.string(),
  name_as: z.string(),
  type: z.string(),
});
export type LocationItem = z.infer<typeof LocationItemSchema>;

/** `GET /api/meta/config` → emergency contacts for the urgent banner (phone may be "" until configured). */
export const EmergencyContactSchema = z.object({
  phone: z.string(),
  label_en: z.string(),
  label_as: z.string(),
});
export type EmergencyContact = z.infer<typeof EmergencyContactSchema>;
export const PublicConfigSchema = z.object({
  campus_security: EmergencyContactSchema.nullable(),
  campus_emergency: EmergencyContactSchema.nullable(),
});
export type PublicConfig = z.infer<typeof PublicConfigSchema>;

// ---------- M4: tracking API contracts (PRD section 10, screens S07–S10) ----------

/** Statuses that still need work. `status=active` in list queries. */
export const OPEN_STATUSES = ["submitted", "triaged", "needs_review", "assigned", "in_progress"] as const satisfies readonly Status[];
/** `status=resolved` in list queries. */
export const DONE_STATUSES = ["resolved", "closed"] as const satisfies readonly Status[];
/** Reporter may reopen a closed ticket for this long (PRD 8.1). */
export const REOPEN_WINDOW_DAYS = 7;
export const LIST_PAGE_SIZE = 20;

export const LIST_SCOPES = ["mine", "public", "dept", "assigned"] as const;
export type ListScope = (typeof LIST_SCOPES)[number];

const csv = <T extends z.ZodType>(item: T) =>
  z.preprocess(
    (s) => (typeof s === "string" && s ? s.split(",").map((x) => x.trim()).filter(Boolean) : []),
    z.array(item),
  );

/**
 * `GET /api/complaints` query. `status` is a comma list of statuses, or the group keywords
 * `active` (open statuses) / `resolved` (resolved + closed) / `all`.
 */
export const ComplaintListQuerySchema = z.object({
  scope: z.enum(LIST_SCOPES).default("mine"),
  status: z
    .string()
    .optional()
    .transform((s, ctx): Status[] => {
      if (!s || s === "all") return [];
      if (s === "active") return [...OPEN_STATUSES];
      if (s === "resolved") return [...DONE_STATUSES];
      const parts = s.split(",").map((x) => x.trim()).filter(Boolean);
      const bad = parts.find((p) => !(STATUSES as readonly string[]).includes(p));
      if (bad) {
        ctx.addIssue({ code: "custom", message: `Unknown status '${bad}'` });
        return z.NEVER;
      }
      return parts as Status[];
    }),
  priority: csv(z.coerce.number().int().min(1).max(4)),
  category: csv(z.enum(CATEGORIES)),
  location: z.guid().optional(),
  /** super_admin only (dept scope); dept_admins are always scoped to their own department. */
  department: z.guid().optional(),
  lang: z.enum(["en", "as"]).optional(),
  q: z.string().max(100).optional(),
  cursor: z.string().max(200).optional(),
});
export type ComplaintListQuery = z.output<typeof ComplaintListQuerySchema>;

export const NamedRefSchema = z.object({ id: z.string(), name_en: z.string(), name_as: z.string() });
export type NamedRef = z.infer<typeof NamedRefSchema>;

export const ComplaintListItemSchema = z.object({
  id: z.string(),
  code: z.string(),
  title_en: z.string().nullable(),
  title_as: z.string().nullable(),
  summary_en: z.string().nullable(),
  summary_as: z.string().nullable(),
  category: z.enum(CATEGORIES),
  priority: z.number().int().min(1).max(4),
  status: z.enum(STATUSES),
  /** null for signed-out viewers of the public scope. */
  original_lang: z.enum(["en", "as"]).nullable(),
  location: NamedRefSchema.nullable(),
  metoo_count: z.number().int(),
  created_at: z.string(),
  updated_at: z.string(),
  /** null when no department/SLA yet, and always null for signed-out viewers of the public scope. */
  sla_due_at: z.string().nullable(),
  is_urgent: z.boolean(),
  visibility: z.enum(VISIBILITIES),
  /** Signed URL (1 h) of the first photo, or null. Always null for signed-out viewers. */
  thumb: z.string().nullable(),
  /** public scope, signed in only. */
  supported_by_me: z.boolean().optional(),
  /** dept scope only. reporter_name is null when the reporter chose anonymous. */
  anonymous: z.boolean().optional(),
  reporter_name: z.string().nullable().optional(),
});
export type ComplaintListItem = z.infer<typeof ComplaintListItemSchema>;

export const ComplaintListPageSchema = z.object({
  items: z.array(ComplaintListItemSchema),
  nextCursor: z.string().nullable(),
});
export type ComplaintListPage = z.infer<typeof ComplaintListPageSchema>;

/** Who did a timeline step, relative to the viewer. Names are only given to admins of the ticket. */
export const EVENT_ACTORS = ["me", "reporter", "staff", "supporter", "system"] as const;
export type EventActor = (typeof EVENT_ACTORS)[number];

export const TimelineEventSchema = z.object({
  id: z.number().int(),
  /** created | status | assigned | note | metoo | ai */
  type: z.string(),
  from_status: z.enum(STATUSES).nullable(),
  to_status: z.enum(STATUSES).nullable(),
  note_en: z.string().nullable(),
  note_as: z.string().nullable(),
  created_at: z.string(),
  actor: z.enum(EVENT_ACTORS),
  /** Admins of the ticket only; never the reporter of an anonymous ticket. */
  actor_name: z.string().nullable().optional(),
});
export type TimelineEvent = z.infer<typeof TimelineEventSchema>;

export const ComplaintDetailSchema = ComplaintListItemSchema.extend({
  /** Owner, admins of the ticket's department and the assignee only; null for everyone else. */
  original_text: z.string().nullable(),
  location_note: z.string().nullable(),
  photos: z.array(z.string()),
  resolved_at: z.string().nullable(),
  resolution: z
    .object({ note_en: z.string().nullable(), note_as: z.string().nullable(), photo_url: z.string().nullable() })
    .nullable(),
  rating: z.number().int().min(1).max(5).nullable(),
  verified_by_reporter: z.boolean().nullable(),
  department: NamedRefSchema.nullable(),
  is_owner: z.boolean(),
  /** The viewer is an admin of the ticket's department, a super admin, or the assignee. */
  is_staff_view: z.boolean(),
  supported_by_me: z.boolean(),
  can_support: z.boolean(),
  can_verify: z.boolean(),
  can_reopen: z.boolean(),
  events: z.array(TimelineEventSchema),
  /** Next statuses this viewer may move the ticket to (PRD 8.2, filtered by role). */
  allowed_next: z.array(z.enum(STATUSES)),
  /** Staff view only. name is null for anonymous reports. */
  reporter: z.object({ name: z.string().nullable(), anonymous: z.boolean() }).nullable().optional(),
  /** Admin view only: what the AI decided (no raw provider internals). */
  ai: z
    .object({
      status: z.string(),
      model: z.string().nullable(),
      confidence: z.number().nullable(),
      priority_reason_en: z.string().nullable(),
      auto_routed: z.boolean().nullable(),
    })
    .nullable()
    .optional(),
});
export type ComplaintDetail = z.infer<typeof ComplaintDetailSchema>;

export const SupportResultSchema = z.object({ metoo_count: z.number().int() });
export type SupportResult = z.infer<typeof SupportResultSchema>;

/**
 * `POST /api/complaints/[id]/verify` — reporter only.
 * resolved + fixed=true → closed (+ rating) · resolved + fixed=false → in_progress (reason required) ·
 * closed + fixed=false within 7 days → in_progress (reopen, reason required).
 */
export const VerifyRequestSchema = z
  .object({
    fixed: z.boolean(),
    rating: z.number().int().min(1).max(5).optional(),
    reason: z.string().trim().max(500).optional(),
  })
  .refine((v) => v.fixed || (v.reason?.length ?? 0) >= 3, { message: "Please say what is still wrong", path: ["reason"] });
export type VerifyRequest = z.infer<typeof VerifyRequestSchema>;

export const VerifyResultSchema = z.object({
  id: z.string(),
  status: z.enum(STATUSES),
  rating: z.number().int().nullable(),
  verified_by_reporter: z.boolean().nullable(),
});
export type VerifyResult = z.infer<typeof VerifyResultSchema>;

export const NotificationItemSchema = z.object({
  id: z.number().int(),
  complaint_id: z.string().nullable(),
  title_en: z.string(),
  title_as: z.string(),
  read: z.boolean(),
  created_at: z.string(),
});
export type NotificationItem = z.infer<typeof NotificationItemSchema>;

export const NotificationsPageSchema = z.object({
  items: z.array(NotificationItemSchema),
  nextCursor: z.string().nullable(),
  unread: z.number().int(),
});
export type NotificationsPage = z.infer<typeof NotificationsPageSchema>;

/** `POST /api/notifications/read` — no ids ⇒ mark all read. */
export const MarkReadRequestSchema = z.object({ ids: z.array(z.number().int().positive()).max(200).optional() });
export type MarkReadRequest = z.infer<typeof MarkReadRequestSchema>;
export const UnreadCountSchema = z.object({ unread: z.number().int() });
export type UnreadCount = z.infer<typeof UnreadCountSchema>;

/** Same values as THEMES in src/lib/theme.ts (kept here so domain.ts has no app imports). */
export const PROFILE_THEMES = ["tea", "brahmaputra", "muga"] as const;

/** `PATCH /api/profile`. Role can never be changed here (RLS). department_id: students/staff only. */
export const ProfileUpdateSchema = z
  .strictObject({
    full_name: z.string().trim().min(1).max(80).optional(),
    lang_pref: z.enum(["en", "as"]).optional(),
    theme: z.enum(PROFILE_THEMES).optional(),
    font_size: z.enum(["normal", "large"]).optional(),
    hostel: z.string().trim().max(80).nullable().optional(),
    department_id: z.guid().nullable().optional(),
    /** Sent by /onboarding when the user finishes setup (sets onboarded_at once). */
    onboarded: z.literal(true).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "Nothing to update" });
export type ProfileUpdate = z.infer<typeof ProfileUpdateSchema>;
