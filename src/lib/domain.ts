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
  /** Pixel character 0–59 (/campus/team-characters.webp); null = derived from the id. */
  avatar_character: number | null;
  role: Role;
  lang_pref: "en" | "as";
  theme: string;
  font_size: "normal" | "large";
  hostel: string | null;
  /** Students only: programme/course (profile info). */
  course: string | null;
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
  /** The change conflicts with existing data (e.g. deleting a department that still has complaints). */
  CONFLICT: 409,
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
  abusive_reason_en: z.string().max(200).nullable().default(null).describe("If is_abusive is true, polite explanation of the violation"),
  abusive_reason_as: z.string().max(250).nullable().default(null).describe("Assamese translation of abusive explanation"),
  has_personal_data: z.boolean().describe("Contains phone numbers or other personal data"),
  is_urgent: z.boolean().describe("Immediate danger to people: fire, injury, violence, threats, medical emergency"),
  is_sensitive_suggested: z.boolean().describe("Harassment, threats, safety or personal matter that only admins should see"),
  confidence: z.number().min(0).max(1),
  is_relevant: z.boolean().default(true).describe("Whether this is a genuine university/campus civic/facility/academic/safety issue. False if spam, test gibberish, homework question, or unrelated."),
  rejection_reason_en: z.string().max(200).nullable().default(null).describe("If is_relevant is false, polite reason why it's not a campus issue"),
  rejection_reason_as: z.string().max(250).nullable().default(null).describe("Assamese translation of rejection reason"),
  has_abusive_image: z.boolean().default(false).describe("True if any uploaded image contains offensive gestures, hate symbols, vulgar graffiti, or targeted harassment"),
  has_explicit_image: z.boolean().default(false).describe("True if any uploaded image contains explicit, NSFW, sexual, gore, or violent content"),
  has_ai_image: z.boolean().default(false).describe("True if any uploaded image is AI-generated, synthetic, digital render, or artificial rather than an authentic photo"),
  image_rejection_reason_en: z.string().max(200).nullable().default(null),
  image_rejection_reason_as: z.string().max(250).nullable().default(null),
});
export type Intake = z.infer<typeof IntakeSchema>;

export const AnalyzeRequestSchema = z.object({
  text: z.string().max(2000).default(""),
  // ~1.6 M chars ≈ 1.2 MB decoded per photo; the client compresses to ≤ 400 KB WebP.
  images: z.array(z.string().startsWith("data:image/").max(1_600_000, "photo too large")).max(3).default([]),
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
  /** Idempotency key (one per form): a retried submit returns the first ticket instead of a duplicate. */
  client_request_id: z.guid().optional(),
  /** Ignored (untrusted): the server recomputes the source and every safety field at submit. Kept for older clients. */
  intake_source: z.enum(["ai", "fallback"]).optional(),
  /** Ignored (untrusted). */
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
  /** Set when the ticket was auto-assigned to field staff right away (safe tickets only, migration 10). */
  assignee: z.object({ id: z.string(), name: z.string().nullable() }).nullable().optional(),
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

/** `GET/PATCH /api/admin/settings` — super admin switches stored in app_config. */
export const ASSIGN_MODES = ["off", "approval", "auto"] as const;
export type AssignMode = (typeof ASSIGN_MODES)[number];

export const AdminSettingsSchema = z.object({
  /** Urgent reports are assigned straight away (to a team of `emergency_team_size`). */
  auto_assign_emergency: z.boolean(),
  emergency_team_size: z.number().int().min(1).max(4),
  /** Safe tickets: off · approval (suggest, an admin approves) · auto (assign straight away). */
  assign_mode: z.enum(ASSIGN_MODES),
});
export const AdminSettingsPatchSchema = AdminSettingsSchema.partial().refine((v) => Object.keys(v).length > 0, { message: "Nothing to update" });
export type AdminSettings = z.infer<typeof AdminSettingsSchema>;

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
  /** dept scope only: current assignee's name (null = unassigned or no name). */
  assignee_name: z.string().nullable().optional(),
  assigned: z.boolean().optional(),
  /** dept scope only: the current assignee was picked by auto-assignment. */
  auto_assigned: z.boolean().optional(),
  /** assigned scope: the viewer is a helper on this job, not the lead (only the lead starts / resolves). */
  helper: z.boolean().optional(),
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

/** Extra detail for admins of the ticket (S15); attached to ComplaintDetail as `admin`. */
export const ComplaintAdminInfoSchema = z.object({
  department_id: z.string().nullable(),
  assignee: z.object({ id: z.string(), name: z.string().nullable() }).nullable(),
  parent: z.object({ id: z.string(), code: z.string(), title_en: z.string().nullable(), title_as: z.string().nullable() }).nullable(),
  duplicates: z.array(z.object({ id: z.string(), code: z.string(), title_en: z.string().nullable(), title_as: z.string().nullable() })),
  is_sensitive: z.boolean(),
  anonymous: z.boolean(),
  /** Present while the current assignee is the one auto-assignment picked (reasons for the workspace chip). */
  auto_assign: z
    .object({
      note_en: z.string().nullable(),
      note_as: z.string().nullable(),
      skill: z.boolean(),
      covers: z.boolean(),
      open_jobs: z.number().int(),
      at: z.string().nullable(),
    })
    .nullable()
    .optional(),
  /** Assignment suggested by the workflow (assign_mode "approval"), waiting for an admin; null once assigned. */
  proposal: z
    .object({
      id: z.string(),
      name: z.string().nullable(),
      confidence: z.number(),
      level: z.number().int(),
      note_en: z.string().nullable(),
      note_as: z.string().nullable(),
      at: z.string().nullable(),
    })
    .nullable()
    .optional(),
  /** Team members besides the lead assignee (migration 18). */
  helpers: z.array(z.object({ id: z.string(), name: z.string().nullable() })).optional(),
});
export type ComplaintAdminInfo = z.infer<typeof ComplaintAdminInfoSchema>;

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
  /** Admins of the ticket's department / super admin only (S15 workspace). */
  admin: ComplaintAdminInfoSchema.optional(),
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
    /** Pixel character avatar (0–59); null = default derived from the user id. */
    avatar_character: z.number().int().min(0).max(59).nullable().optional(),
    hostel: z.string().trim().max(80).nullable().optional(),
    /** Students only. */
    course: z.string().trim().max(80).nullable().optional(),
    /** Staff only: students report issues, they are never part of a fixing department. */
    department_id: z.guid().nullable().optional(),
    /** Sent by /onboarding when the user finishes setup (sets onboarded_at once). */
    onboarded: z.literal(true).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "Nothing to update" });
export type ProfileUpdate = z.infer<typeof ProfileUpdateSchema>;

// ---------- M5: admin core + field staff API contracts (PRD section 10, screens S12–S15) ----------


/** `PATCH /api/complaints/[id]`. Admins of the ticket's department / super admin: any field. Assignee: status (in_progress) + note. */
export const ComplaintPatchSchema = z
  .strictObject({
    status: z.enum(STATUSES).optional(),
    priority: z.number().int().min(1).max(4).optional(),
    category: z.enum(CATEGORIES).optional(),
    department_id: z.guid().optional(),
    /** null unassigns. */
    assignee_id: z.guid().nullable().optional(),
    /** Timeline note shown to the reporter (complaint_events type 'note'). */
    note: z.string().trim().min(1).max(1000).optional(),
    /** Required when status = rejected; shown on the timeline. */
    reason: z.string().trim().min(3).max(500).optional(),
    is_urgent: z.boolean().optional(),
    /** true also forces visibility private (DB constraint). */
    is_sensitive: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "Nothing to update" })
  .refine((v) => v.status !== "rejected" || (v.reason?.length ?? 0) >= 3, {
    message: "A reason is required to reject",
    path: ["reason"],
  });
export type ComplaintPatch = z.infer<typeof ComplaintPatchSchema>;

/** Row returned by PATCH / resolve / link. */
export const ComplaintUpdateResultSchema = z.object({
  id: z.string(),
  code: z.string(),
  status: z.enum(STATUSES),
  priority: z.number().int(),
  category: z.enum(CATEGORIES),
  department_id: z.string().nullable(),
  assignee_id: z.string().nullable(),
  parent_id: z.string().nullable(),
  is_urgent: z.boolean(),
  is_sensitive: z.boolean(),
  visibility: z.enum(VISIBILITIES),
  sla_due_at: z.string().nullable(),
  updated_at: z.string(),
});
export type ComplaintUpdateResult = z.infer<typeof ComplaintUpdateResultSchema>;

/** Storage path returned by /api/upload/resolution: `<complaint uuid>/<uuid>.<ext>` in resolution-photos. */
export const RESOLUTION_PATH = /^[0-9a-f-]{36}\/[0-9a-f-]{36}\.(jpg|png|webp)$/;

/** `POST /api/complaints/[id]/resolve`. Photo required for field staff, optional for admins. */
export const ResolveRequestSchema = z.object({
  note: z.string().trim().min(3).max(1000),
  photo_path: z.string().regex(RESOLUTION_PATH, "invalid photo path").nullish(),
});
export type ResolveRequest = z.infer<typeof ResolveRequestSchema>;

/** `POST /api/complaints/[id]/link`: mark as duplicate of `parent_id`, or `{unlink: true}`. */
export const LinkRequestSchema = z.union([
  z.strictObject({ parent_id: z.guid() }),
  z.strictObject({ unlink: z.literal(true) }),
]);
export type LinkRequest = z.infer<typeof LinkRequestSchema>;

/** One allowed status move (`GET /api/meta/transitions`). */
export const TransitionSchema = z.object({ from: z.enum(STATUSES), to: z.enum(STATUSES) });
export type Transition = z.infer<typeof TransitionSchema>;

/** `GET /api/admin/staff?department=` → people who can be assigned (names only). */
export const StaffMemberSchema = z.object({
  id: z.string(),
  full_name: z.string().nullable(),
  role: z.enum(["field_staff", "dept_admin"]),
});
export type StaffMember = z.infer<typeof StaffMemberSchema>;

/** `GET /api/complaints/[id]/similar` (admins): possible duplicates in the admin's reach, private ones included. */
export const AdminSimilarItemSchema = SimilarItemSchema.extend({
  department_id: z.string().nullable(),
  created_at: z.string(),
});
export type AdminSimilarItem = z.infer<typeof AdminSimilarItemSchema>;

/** Internal note (messages.internal = true): admins of the ticket + assignee only. */
export const InternalNoteSchema = z.object({
  id: z.number().int(),
  body: z.string(),
  created_at: z.string(),
  author: z.string().nullable(),
  mine: z.boolean(),
});
export type InternalNote = z.infer<typeof InternalNoteSchema>;
export const InternalNoteRequestSchema = z.object({ body: z.string().trim().min(1).max(1000) });

// ---------- S18: departments, members, staff assignment (migration 10) ----------

const BENGALI_RA = "র";
const assameseName = z
  .string()
  .trim()
  .min(2)
  .max(80)
  .refine((s) => !s.includes(BENGALI_RA), { message: "Use Assamese ৰ, not Bengali র" });

const slaHours = z.number().int().min(1).max(2160);
/** Hours to act per priority (keys "1".."4" = P1..P4), e.g. {"1":4,"2":24,"3":72,"4":168}. */
export const SlaHoursSchema = z.strictObject({ "1": slaHours, "2": slaHours, "3": slaHours, "4": slaHours });
export type SlaHours = z.infer<typeof SlaHoursSchema>;
export const DEFAULT_SLA_HOURS: SlaHours = { "1": 4, "2": 24, "3": 72, "4": 168 };

const categoryList = z
  .array(z.enum(CATEGORIES))
  .max(CATEGORIES.length)
  .transform((a) => [...new Set(a)]);

/** `POST /api/admin/departments`. */
export const DepartmentInputSchema = z.strictObject({
  name_en: z.string().trim().min(2).max(80),
  name_as: assameseName,
  categories: categoryList.default([]),
  sla_hours: SlaHoursSchema.default(DEFAULT_SLA_HOURS),
});
export type DepartmentInput = z.input<typeof DepartmentInputSchema>;

/** `PATCH /api/admin/departments/[id]`. */
export const DepartmentPatchSchema = z
  .strictObject({
    name_en: z.string().trim().min(2).max(80).optional(),
    name_as: assameseName.optional(),
    categories: categoryList.optional(),
    sla_hours: SlaHoursSchema.optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "Nothing to update" });
export type DepartmentPatch = z.infer<typeof DepartmentPatchSchema>;

export const DepartmentSchema = z.object({
  id: z.string(),
  name_en: z.string(),
  name_as: z.string(),
  categories: z.array(z.enum(CATEGORIES)),
  sla_hours: SlaHoursSchema,
  created_at: z.string(),
  member_count: z.number().int(),
  open_count: z.number().int(),
});
export type Department = z.infer<typeof DepartmentSchema>;

/** Roles a super admin can give from S18 (a super admin can't change their own role). */
/** Roles a department admin can give, inside their own department only. */
export const DEPT_ADMIN_MEMBER_ROLES = ["field_staff", "staff"] as const satisfies readonly Role[];
export const MEMBER_ROLES = ["field_staff", "dept_admin", "super_admin", "staff", "student"] as const satisfies readonly Role[];
export type MemberRole = (typeof MEMBER_ROLES)[number];

/** Hidden staff experience (staff_experience, migration 18): super admins, their dept admins and themselves. */
export const StaffExperienceSchema = z.object({
  user_id: z.string(),
  jobs_done: z.number().int(),
  points: z.number().int(),
  level: z.number().int().min(1).max(4),
  avg_rating: z.number().nullable(),
  on_time_pct: z.number().int().nullable(),
  open_jobs: z.number().int(),
});
export type StaffExperience = z.infer<typeof StaffExperienceSchema>;

export const MemberSchema = z.object({
  id: z.string(),
  name: z.string().nullable(),
  email: z.string().nullable(),
  role: z.enum(ROLES),
  department_id: z.string().nullable(),
  skills: z.array(z.enum(CATEGORIES)),
  coverage_location_ids: z.array(z.string()),
  active: z.boolean(),
  /** Tickets assigned to this person that are assigned or in progress. */
  open_jobs: z.number().int(),
  last_assigned_at: z.string().nullable(),
  /** Field staff and dept admins only, and only for callers allowed to see it. */
  experience: StaffExperienceSchema.nullable().optional(),
  /** Set by POST /api/admin/members when the email had no account and an invite was sent. */
  invited: z.boolean().optional(),
});
export type Member = z.infer<typeof MemberSchema>;

const coverageList = z
  .array(z.guid())
  .max(100)
  .transform((a) => [...new Set(a)]);

/** `POST /api/admin/members` — give an account a role; an email without an account gets an invite first. */
export const MemberAddSchema = z.strictObject({
  email: z.email().max(254),
  role: z.enum(MEMBER_ROLES),
  department_id: z.guid().nullish(),
  skills: categoryList.optional(),
  coverage_location_ids: coverageList.optional(),
});
export type MemberAdd = z.infer<typeof MemberAddSchema>;

/** `PATCH /api/admin/members/[id]`. */
export const MemberPatchSchema = z
  .strictObject({
    role: z.enum(MEMBER_ROLES).optional(),
    department_id: z.guid().nullable().optional(),
    skills: categoryList.optional(),
    coverage_location_ids: coverageList.optional(),
    active: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "Nothing to update" });
export type MemberPatch = z.infer<typeof MemberPatchSchema>;

/** `GET /api/complaints/[id]/assignees` — ranked field staff for the workspace (best first). */
export const AssigneeSuggestionSchema = z.object({
  id: z.string(),
  name: z.string().nullable(),
  score: z.number().int(),
  reasons: z.object({
    /** The ticket's category is one of their skills. */
    skill: z.boolean(),
    /** They cover the ticket's building (or all buildings). */
    covers: z.boolean(),
    open_jobs: z.number().int(),
    /** Hidden experience level 1 newbie … 4 expert (admins and the person only). */
    level: z.number().int().min(1).max(4),
    jobs_done: z.number().int(),
    /** Their experience suits this ticket's severity (senior for urgent/P1, newer staff for P3–P4). */
    fit: z.boolean(),
  }),
});
export type AssigneeSuggestion = z.infer<typeof AssigneeSuggestionSchema>;



/** `POST /api/complaints/[id]/proposal` — approve or dismiss the suggested assignee. */
export const ProposalDecisionSchema = z.strictObject({ approve: z.boolean() });

/** `POST /api/complaints/[id]/helpers` / `DELETE ?user=`. */
export const HelperAddSchema = z.strictObject({ user_id: z.guid() });

export const ADMIN_STATS_DAYS = [7, 14, 30] as const;
export const AdminStatsQuerySchema = z.object({
  days: z.coerce.number().int().refine((d) => (ADMIN_STATS_DAYS as readonly number[]).includes(d), "days must be 7, 14 or 30").default(14),
  /** super_admin only. */
  department: z.guid().optional(),
});

export const AdminStatsSchema = z.object({
  /** null = all departments (super admin). */
  department_id: z.string().nullable(),
  days: z.number().int(),
  stats: z.object({
    /** submitted + triaged + needs_review + assigned + in_progress */
    open: z.number().int(),
    in_progress: z.number().int(),
    overdue: z.number().int(),
    needs_review: z.number().int(),
    fixed_week: z.number().int(),
    avg_resolution_hours: z.number().nullable(),
    rating_avg: z.number().nullable(),
    rating_count: z.number().int(),
    by_lang: z.object({ en: z.number().int(), as: z.number().int() }),
  }),
  trend: z.array(z.object({ day: z.string(), created: z.number().int(), resolved: z.number().int() })),
  categories: z.array(z.object({ category: z.enum(CATEGORIES), total: z.number().int() })),
  /** super admin only; [] otherwise. */
  load: z.array(
    z.object({ department_id: z.string(), name_en: z.string(), name_as: z.string(), open_count: z.number().int(), overdue: z.number().int() }),
  ),
  overdue: z.array(
    z.object({
      id: z.string(),
      code: z.string(),
      title_en: z.string().nullable(),
      title_as: z.string().nullable(),
      priority: z.number().int(),
      status: z.enum(STATUSES),
      sla_due_at: z.string().nullable(),
    }),
  ),
});
export type AdminStats = z.infer<typeof AdminStatsSchema>;
