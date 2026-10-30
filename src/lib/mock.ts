/**
 * Typed fake data for every API in PRD section 10, so screens can be built before the APIs exist.
 * Dev/gallery use only — never render these on a production screen. Swap `mockFetch(...)` for the real
 * `fetch` once the route lands; the shapes here are the contract the screens expect.
 *
 * Assamese strings use ৰ (U+09F0) / ৱ (U+09F1) only.
 */
import type {
  Category, Intake, LocationItem, PublicConfig, Role, SimilarItem, Status, SubmitResult, Visibility,
} from "@/lib/domain";

/* ============================== Types ============================== */

export type Lang = "en" | "as";
export type Bilingual = { en: string; as: string };

export type Location = LocationItem & { lat: number | null; lng: number | null; map_x: number | null; map_y: number | null };

export type SlaHours = Record<"1" | "2" | "3" | "4", number>;
export type Department = { id: string; name_en: string; name_as: string; categories: Category[]; sla_hours: SlaHours };

export type PersonRef = { id: string; full_name: string; avatar_url: string | null; role: Role };

/** Row shape of list endpoints (`GET /api/complaints`). Superset of `IssueCardData`. */
export type ComplaintListItem = {
  id: string;
  code: string;
  title_en: string | null;
  title_as: string | null;
  summary_en: string | null;
  summary_as: string | null;
  category: Category;
  priority: number;
  status: Status;
  visibility: Visibility;
  anonymous: boolean;
  is_sensitive: boolean;
  is_urgent: boolean;
  original_lang: Lang;
  location_id: string | null;
  location: Pick<Location, "id" | "name_en" | "name_as"> | null;
  department_id: string | null;
  assignee_id: string | null;
  parent_id: string | null;
  metoo_count: number;
  /** First photo (signed URL) or null. */
  photo_url: string | null;
  sla_due_at: string | null;
  created_at: string;
  updated_at: string;
};

export type EventType = "created" | "status" | "assigned" | "note" | "metoo" | "ai";
export type ComplaintEvent = {
  id: number;
  complaint_id: string;
  type: EventType;
  from_status: Status | null;
  to_status: Status | null;
  note_en: string | null;
  note_as: string | null;
  /** Display name; null for system/AI or anonymous. */
  actor_name: string | null;
  created_at: string;
};

export type AiMeta = {
  source: "ai" | "fallback";
  model: string | null;
  confidence: number | null;
  priority_reason_en: string | null;
  ms: number | null;
};

/** `GET /api/complaints/[id]`. */
export type ComplaintDetail = ComplaintListItem & {
  original_text: string;
  location_note: string | null;
  photo_urls: string[];
  department: Pick<Department, "id" | "name_en" | "name_as"> | null;
  assignee: PersonRef | null;
  /** null when anonymous (for admins too) or when the viewer may not see it. */
  reporter: PersonRef | null;
  ai_meta: AiMeta;
  resolution_note_en: string | null;
  resolution_note_as: string | null;
  resolution_photo_url: string | null;
  resolved_at: string | null;
  rating: number | null;
  verified_by_reporter: boolean | null;
  /** Viewer has pressed Me too. */
  supported: boolean;
  events: ComplaintEvent[];
};

export type Paginated<T> = { items: T[]; nextCursor: string | null };

export type Notification = {
  id: number;
  complaint_id: string | null;
  title_en: string;
  title_as: string;
  read: boolean;
  created_at: string;
};

/** `GET /api/complaints/[id]/messages` — `body_translated` is in the other language. */
export type Message = {
  id: number;
  complaint_id: string;
  sender: Pick<PersonRef, "id" | "full_name" | "role"> | null;
  body: string;
  lang: Lang;
  body_translated: string | null;
  internal: boolean;
  created_at: string;
};

/** `POST /api/ai/analyze`. */
export type AnalyzeResult = { intake: Intake; source: "ai" | "fallback"; model: string | null; ms: number };

/** `rpc dashboard_stats()` (+ fields the admin dashboard derives). */
export type DashboardStats = {
  open: number;
  in_progress: number;
  resolved: number;
  overdue: number;
  contributors: number;
  avg_resolution_hours: number | null;
  by_lang: { en: number; as: number };
  resolved_this_week: number;
  satisfaction: number | null;
};
export type TrendPoint = { day: string; created: number; resolved: number };
export type CategoryCount = { category: Category; total: number };
export type DepartmentLoad = { department_id: string; name_en: string; name_as: string; open_count: number; overdue: number };
export type TopLocation = { location_id: string; name_en: string; name_as: string; open_count: number; total: number };

/** `GET /api/admin/stats?days=`. */
export type AdminStats = {
  stats: DashboardStats;
  trend: TrendPoint[];
  categories: CategoryCount[];
  load: DepartmentLoad[];
  top_locations: TopLocation[];
};

/** `GET /api/admin/brief`. */
export type DailyBrief = { en: string[]; as: string[]; generated_at: string };

/** `GET /api/meta/transitions`. */
export type Transition = { from: Status; to: Status };

/** `POST /api/complaints/[id]/reply-draft`. */
export type ReplyDraft = { text: string; lang: Lang };
/** `POST /api/complaints/[id]/check-resolution`. */
export type ResolutionCheck = { verdict: "resolved" | "not_resolved" | "unclear"; reason_en: string; reason_as: string };

export type AiPurpose = "intake" | "embed" | "dedup_verify" | "agent" | "reply_draft" | "translate_msg" | "resolution_check" | "daily_brief";

/** `GET /api/sys/keys` (masked). */
export type SysKey = {
  id: string;
  label: string;
  provider: "google" | "openrouter";
  last4: string;
  enabled: boolean;
  rpm_limit: number;
  simulate_failure: boolean;
  status: "ok" | "cooldown" | "disabled" | "failing";
  fail_count: number;
  cooldown_until: string | null;
  last_used_at: string | null;
};

/** `GET /api/sys/models` — one row of a purpose chain (lower priority = tried first). */
export type SysModel = {
  id: string;
  provider: "google" | "openrouter";
  model: string;
  purpose: AiPurpose;
  priority: number;
  caps: string[];
  enabled: boolean;
};

export type AiLogStatus = "ok" | "rate_limited" | "error" | "timeout" | "invalid" | "fallback";
/** `GET /api/sys/logs`. Rows sharing `request_id` form one failover chain. */
export type SysLog = {
  id: number;
  request_id: string;
  purpose: AiPurpose;
  provider: string | null;
  model: string | null;
  key_label: string | null;
  latency_ms: number | null;
  status: AiLogStatus;
  error: string | null;
  created_at: string;
};

/** `GET /api/sys/health`. */
export type SysHealth = {
  models: { purpose: AiPurpose; provider: string; model: string; calls: number; success_rate: number; p50_ms: number; p95_ms: number; last_error: string | null }[];
  keys: { label: string; provider: string; calls_per_min: number; cooldown_until: string | null; failures: number }[];
  generated_at: string;
};

/** `POST /api/sys/test`. */
export type SysTestResult = {
  purpose: AiPurpose;
  output: string;
  attempts: { provider: string; model: string; key_label: string | null; status: AiLogStatus; latency_ms: number }[];
};

/* ============================== Helpers ============================== */

// Round "now" to 10 minutes so server and client renders agree most of the time.
const NOW = Math.floor(Date.now() / 600_000) * 600_000;
const HOUR = 3_600_000;
const ago = (hours: number) => new Date(NOW - hours * HOUR).toISOString();
const ahead = (hours: number) => new Date(NOW + hours * HOUR).toISOString();
const uid = (prefix: string, n: number) => `${prefix}-0000-4000-8000-${String(n).padStart(12, "0")}`;

/** Resolves `data` after `ms` (default 400) — mimics a network call. Pass `fail` to test error states. */
export function mockFetch<T>(data: T, { ms = 400, fail = false }: { ms?: number; fail?: boolean } = {}): Promise<T> {
  return new Promise((resolve, reject) =>
    setTimeout(() => (fail ? reject(new Error("mock failure")) : resolve(structuredClone(data))), ms),
  );
}

/* ============================== Reference data (supabase/seed.sql) ============================== */

export const MOCK_DEPARTMENTS: Department[] = [
  { id: uid("d0000000", 1), name_en: "Estate & Maintenance", name_as: "এষ্টেট আৰু ৰক্ষণাবেক্ষণ", categories: ["plumbing", "infrastructure"], sla_hours: { 1: 4, 2: 24, 3: 72, 4: 168 } },
  { id: uid("d0000000", 2), name_en: "Electrical Section", name_as: "বৈদ্যুতিক শাখা", categories: ["electrical"], sla_hours: { 1: 4, 2: 24, 3: 72, 4: 168 } },
  { id: uid("d0000000", 3), name_en: "Water & Sanitation", name_as: "পানী আৰু চাফাই", categories: ["water_supply", "sanitation"], sla_hours: { 1: 4, 2: 24, 3: 72, 4: 168 } },
  { id: uid("d0000000", 4), name_en: "Hostel Administration", name_as: "হোষ্টেল প্ৰশাসন", categories: ["hostel", "mess_food"], sla_hours: { 1: 4, 2: 24, 3: 72, 4: 168 } },
  { id: uid("d0000000", 5), name_en: "IT Cell", name_as: "আইটি চেল", categories: ["it_network"], sla_hours: { 1: 4, 2: 24, 3: 72, 4: 168 } },
  { id: uid("d0000000", 6), name_en: "Academic Section", name_as: "শৈক্ষিক শাখা", categories: ["academic"], sla_hours: { 1: 4, 2: 24, 3: 72, 4: 168 } },
  { id: uid("d0000000", 7), name_en: "Security Office", name_as: "সুৰক্ষা কাৰ্যালয়", categories: ["safety_security"], sla_hours: { 1: 4, 2: 24, 3: 72, 4: 168 } },
  { id: uid("d0000000", 8), name_en: "Transport Section", name_as: "পৰিবহণ শাখা", categories: ["transport", "other"], sla_hours: { 1: 4, 2: 24, 3: 72, 4: 168 } },
];

export const MOCK_LOCATIONS: Location[] = [
  { id: uid("10000000", 1), name_en: "Central Library", name_as: "কেন্দ্ৰীয় পুথিভঁৰাল", type: "academic", lat: null, lng: null, map_x: 0.3, map_y: 0.32 },
  { id: uid("10000000", 2), name_en: "Administrative Building", name_as: "প্ৰশাসনিক ভৱন", type: "admin", lat: null, lng: null, map_x: 0.68, map_y: 0.36 },
  { id: uid("10000000", 3), name_en: "Centre for Computer Science & Applications", name_as: "কম্পিউটাৰ বিজ্ঞান আৰু প্ৰয়োগ কেন্দ্ৰ", type: "academic", lat: null, lng: null, map_x: 0.52, map_y: 0.4 },
  { id: uid("10000000", 4), name_en: "Science Block", name_as: "বিজ্ঞান ভৱন", type: "academic", lat: null, lng: null, map_x: 0.5, map_y: 0.3 },
  { id: uid("10000000", 5), name_en: "Auditorium", name_as: "প্ৰেক্ষাগৃহ", type: "event", lat: null, lng: null, map_x: 0.74, map_y: 0.68 },
  { id: uid("10000000", 6), name_en: "Main Gate", name_as: "মূল দুৱাৰ", type: "gate", lat: null, lng: null, map_x: 0.62, map_y: 0.86 },
  { id: uid("10000000", 7), name_en: "Boys Hostel", name_as: "ল'ৰা হোষ্টেল", type: "hostel", lat: null, lng: null, map_x: 0.34, map_y: 0.66 },
  { id: uid("10000000", 8), name_en: "Girls Hostel", name_as: "ছোৱালী হোষ্টেল", type: "hostel", lat: null, lng: null, map_x: 0.22, map_y: 0.52 },
  { id: uid("10000000", 9), name_en: "Canteen", name_as: "কেণ্টিন", type: "food", lat: null, lng: null, map_x: 0.44, map_y: 0.58 },
  { id: uid("10000000", 10), name_en: "Playground", name_as: "খেলপথাৰ", type: "sports", lat: null, lng: null, map_x: 0.84, map_y: 0.5 },
];

const LOC = (n: number) => {
  const l = MOCK_LOCATIONS[n - 1];
  return { id: l.id, name_en: l.name_en, name_as: l.name_as };
};
const DEPT = (n: number) => MOCK_DEPARTMENTS[n - 1].id;

export const MOCK_PEOPLE = {
  priya: { id: uid("a0000000", 1), full_name: "Priya Gogoi", avatar_url: null, role: "student" },
  rahul: { id: uid("a0000000", 2), full_name: "Rahul Sharma", avatar_url: null, role: "student" },
  bikash: { id: uid("a0000000", 3), full_name: "Bikash Saikia", avatar_url: null, role: "field_staff" },
  dutta: { id: uid("a0000000", 4), full_name: "R. Dutta", avatar_url: null, role: "dept_admin" },
} satisfies Record<string, PersonRef>;

/* ============================== Complaints ============================== */

type Seed = Omit<ComplaintListItem, "id" | "code" | "updated_at" | "visibility" | "anonymous" | "is_sensitive" | "is_urgent" | "parent_id" | "assignee_id" | "photo_url"> &
  Partial<Pick<ComplaintListItem, "visibility" | "anonymous" | "is_sensitive" | "is_urgent" | "parent_id" | "assignee_id" | "photo_url">> & {
    n: number;
    original_text: string;
  };

const SEEDS: Seed[] = [
  {
    n: 1, original_lang: "as", original_text: "হোষ্টেলৰ বাথৰুমত তিনিদিন ধৰি পানী নাই",
    title_en: "No water in Girls Hostel washroom for three days", title_as: "ছোৱালী হোষ্টেলৰ বাথৰুমত তিনিদিন ধৰি পানী নাই",
    summary_en: "The washroom taps in the Girls Hostel have had no water supply for three days.",
    summary_as: "ছোৱালী হোষ্টেলৰ বাথৰুমৰ কলত তিনিদিন ধৰি পানীৰ যোগান নাই।",
    category: "water_supply", priority: 2, status: "assigned", location_id: LOC(8).id, location: LOC(8), department_id: DEPT(3),
    assignee_id: MOCK_PEOPLE.bikash.id, metoo_count: 6, sla_due_at: ahead(5), created_at: ago(19), photo_url: "/mock/issue-water.svg",
  },
  {
    n: 2, original_lang: "en", original_text: "No water in girls hostel washroom",
    title_en: "No water in girls hostel washroom", title_as: "ছোৱালী হোষ্টেলৰ বাথৰুমত পানী নাই",
    summary_en: "There is no water in the Girls Hostel washroom.", summary_as: "ছোৱালী হোষ্টেলৰ বাথৰুমত পানী নাই।",
    category: "water_supply", priority: 2, status: "duplicate", location_id: LOC(8).id, location: LOC(8), department_id: DEPT(3),
    parent_id: uid("c0000000", 1), metoo_count: 0, sla_due_at: null, created_at: ago(3),
  },
  {
    n: 3, original_lang: "en", original_text: "Water leaking from the ceiling on the library 2nd floor",
    title_en: "Water leaking from library 2nd floor ceiling", title_as: "পুথিভঁৰালৰ দ্বিতীয় মহলাৰ চিলিঙৰ পৰা পানী টোপাই আছে",
    summary_en: "Water is dripping from the ceiling on the 2nd floor of the Central Library onto the bookshelves.",
    summary_as: "কেন্দ্ৰীয় পুথিভঁৰালৰ দ্বিতীয় মহলাত চিলিঙৰ পৰা পানী টোপাই কিতাপৰ তাকত পৰিছে।",
    category: "plumbing", priority: 2, status: "in_progress", location_id: LOC(1).id, location: LOC(1), department_id: DEPT(1),
    assignee_id: MOCK_PEOPLE.bikash.id, metoo_count: 3, sla_due_at: ago(2), created_at: ago(30),
  },
  {
    n: 4, original_lang: "as", original_text: "ল'ৰা হোষ্টেলৰ চিৰিৰ ওচৰত বিদ্যুতৰ তাঁৰ খোলা অৱস্থাত আছে",
    title_en: "Exposed electric wire near Boys Hostel staircase", title_as: "ল'ৰা হোষ্টেলৰ চিৰিৰ ওচৰত খোলা বিদ্যুতৰ তাঁৰ",
    summary_en: "An exposed live wire is hanging near the Boys Hostel staircase and is a safety hazard.",
    summary_as: "ল'ৰা হোষ্টেলৰ চিৰিৰ ওচৰত বিদ্যুতৰ তাঁৰ খোলা অৱস্থাত ওলমি আছে, যিটো বিপজ্জনক।",
    category: "electrical", priority: 1, status: "triaged", location_id: LOC(7).id, location: LOC(7), department_id: DEPT(2),
    is_urgent: true, metoo_count: 9, sla_due_at: ahead(1), created_at: ago(3),
  },
  {
    n: 5, original_lang: "en", original_text: "Bin behind the canteen is overflowing, smells terrible",
    title_en: "Overflowing bin behind the canteen", title_as: "কেণ্টিনৰ পিছফালে ডাষ্টবিন উপচি পৰিছে",
    summary_en: "The bin behind the canteen is overflowing and smells bad.",
    summary_as: "কেণ্টিনৰ পিছফালৰ ডাষ্টবিনটো উপচি পৰিছে আৰু দুৰ্গন্ধ ওলাইছে।",
    category: "sanitation", priority: 3, status: "resolved", location_id: LOC(9).id, location: LOC(9), department_id: DEPT(3),
    assignee_id: MOCK_PEOPLE.bikash.id, metoo_count: 2, sla_due_at: ahead(20), created_at: ago(52), photo_url: "/mock/issue-bin.svg",
  },
  {
    n: 6, original_lang: "as", original_text: "কম্পিউটাৰ কেন্দ্ৰত ৱাই-ফাই দুদিন ধৰি বন্ধ",
    title_en: "Wi-Fi down at Computer Science centre for two days", title_as: "কম্পিউটাৰ বিজ্ঞান কেন্দ্ৰত দুদিন ধৰি ৱাই-ফাই বন্ধ",
    summary_en: "There has been no Wi-Fi connection at the Computer Science centre for two days.",
    summary_as: "কম্পিউটাৰ বিজ্ঞান কেন্দ্ৰত দুদিন ধৰি ৱাই-ফাই সংযোগ নাই।",
    category: "it_network", priority: 3, status: "needs_review", location_id: LOC(3).id, location: LOC(3), department_id: DEPT(5),
    metoo_count: 4, sla_due_at: ahead(40), created_at: ago(26),
  },
  {
    n: 7, original_lang: "en", original_text: "Dinner at the hostel mess is always served cold",
    title_en: "Mess dinner served cold", title_as: "মেছত ৰাতিৰ আহাৰ চেঁচা অৱস্থাত দিয়া হয়",
    summary_en: "Dinner at the hostel mess is regularly served cold.",
    summary_as: "হোষ্টেলৰ মেছত ৰাতিৰ আহাৰ সদায় চেঁচা অৱস্থাত পৰিৱেশন কৰা হয়।",
    category: "mess_food", priority: 3, status: "submitted", location_id: LOC(7).id, location: LOC(7), department_id: null,
    metoo_count: 1, sla_due_at: null, created_at: ago(0.2),
  },
  {
    n: 8, original_lang: "as", original_text: "প্ৰেক্ষাগৃহৰ কেইখনমান চকী ভাঙি গৈছে",
    title_en: "Broken seats in the Auditorium", title_as: "প্ৰেক্ষাগৃহৰ কেইখনমান চকী ভাঙি গৈছে",
    summary_en: "Several seats in the front rows of the Auditorium are broken.",
    summary_as: "প্ৰেক্ষাগৃহৰ সন্মুখৰ শাৰীৰ কেইখনমান চকী ভাঙি গৈছে।",
    category: "infrastructure", priority: 4, status: "closed", location_id: LOC(5).id, location: LOC(5), department_id: DEPT(1),
    metoo_count: 0, sla_due_at: ago(100), created_at: ago(260),
  },
  {
    n: 9, original_lang: "en", original_text: "Someone is threatening me near the gate",
    title_en: "Threat reported near the Main Gate", title_as: "মূল দুৱাৰৰ ওচৰত ভাবুকি দিয়াৰ অভিযোগ",
    summary_en: "The reporter says a person is threatening them near the Main Gate.",
    summary_as: "মূল দুৱাৰৰ ওচৰত এজন ব্যক্তিয়ে ভাবুকি দিছে বুলি অভিযোগকাৰীয়ে জনাইছে।",
    category: "safety_security", priority: 1, status: "needs_review", location_id: LOC(6).id, location: LOC(6), department_id: DEPT(7),
    visibility: "private", anonymous: true, is_sensitive: true, is_urgent: true, metoo_count: 0, sla_due_at: ahead(3), created_at: ago(0.6),
  },
  {
    n: 10, original_lang: "as", original_text: "বিজ্ঞান ভৱনৰ শ্ৰেণীকোঠাত প্ৰজেক্টৰ নাই",
    title_en: "No projector in Science Block classroom", title_as: "বিজ্ঞান ভৱনৰ শ্ৰেণীকোঠাত প্ৰজেক্টৰ নাই",
    summary_en: "A classroom in the Science Block has no projector.", summary_as: "বিজ্ঞান ভৱনৰ এটা শ্ৰেণীকোঠাত প্ৰজেক্টৰ নাই।",
    category: "academic", priority: 4, status: "rejected", location_id: LOC(4).id, location: LOC(4), department_id: DEPT(6),
    metoo_count: 0, sla_due_at: null, created_at: ago(120),
  },
  {
    n: 11, original_lang: "en", original_text: "University bus to town leaves 20 minutes late every morning",
    title_en: "Town bus leaves 20 minutes late every morning", title_as: "নগৰলৈ যোৱা বাছ প্ৰতিদিনে পুৱা ২০ মিনিট পলমকৈ যায়",
    summary_en: "The university bus to town departs about 20 minutes late every morning.",
    summary_as: "নগৰলৈ যোৱা বিশ্ববিদ্যালয়ৰ বাছখন প্ৰতিদিনে পুৱা প্ৰায় ২০ মিনিট পলমকৈ যায়।",
    category: "transport", priority: 3, status: "triaged", location_id: LOC(6).id, location: LOC(6), department_id: DEPT(8),
    metoo_count: 12, sla_due_at: ahead(60), created_at: ago(14),
  },
  {
    n: 12, original_lang: "as", original_text: "হোষ্টেলৰ কোঠাৰ দুৱাৰৰ তলা ভাঙি গৈছে",
    title_en: "Broken door lock in Girls Hostel room", title_as: "ছোৱালী হোষ্টেলৰ কোঠাৰ দুৱাৰৰ তলা ভাঙি গৈছে",
    summary_en: "The door lock of a Girls Hostel room is broken, so the room cannot be locked.",
    summary_as: "ছোৱালী হোষ্টেলৰ এটা কোঠাৰ দুৱাৰৰ তলা ভাঙি গৈছে, কোঠাটো বন্ধ কৰিব পৰা নাযায়।",
    category: "hostel", priority: 2, status: "assigned", location_id: LOC(8).id, location: LOC(8), department_id: DEPT(4),
    visibility: "private", metoo_count: 0, sla_due_at: ago(6), created_at: ago(40),
  },
  {
    n: 13, original_lang: "en", original_text: "Playground floodlights stay on all day",
    title_en: "Playground floodlights stay on all day", title_as: "খেলপথাৰৰ লাইটবোৰ গোটেই দিনটো জ্বলি থাকে",
    summary_en: "The floodlights at the playground are left on through the day.",
    summary_as: "খেলপথাৰৰ লাইটবোৰ গোটেই দিনটো জ্বলাই ৰখা হয়।",
    category: "other", priority: 4, status: "submitted", location_id: null, location: null, department_id: null,
    metoo_count: 0, sla_due_at: null, created_at: ago(1.5),
  },
];

const CODES = ["CS-7Q2KXA", "CS-M4D9PB", "CS-3HT8WN", "CS-Z81EVR", "CS-K5NC2J", "CS-B7RW4Y", "CS-P2LF6D", "CS-W9GH3S", "CS-4JXT7M", "CS-E6YU1Q", "CS-N3VB8C", "CS-H1SK5Z", "CS-R8CM2T"];

export const MOCK_COMPLAINTS: ComplaintListItem[] = SEEDS.map(({ n, ...seed }) => {
  const { original_text, ...s } = seed;
  void original_text;
  return {
    visibility: "public",
    anonymous: false,
    is_sensitive: false,
    is_urgent: false,
    parent_id: null,
    assignee_id: null,
    photo_url: null,
    ...s,
    id: uid("c0000000", n),
    code: CODES[n - 1],
    updated_at: s.created_at,
  };
});

const ORIGINAL_TEXT = new Map(SEEDS.map((s) => [uid("c0000000", s.n), s.original_text]));

/* ============================== Events, notifications, messages ============================== */

const W = MOCK_DEPARTMENTS[2];
const c1 = MOCK_COMPLAINTS[0].id;
const c3 = MOCK_COMPLAINTS[2].id;
const c5 = MOCK_COMPLAINTS[4].id;

export const MOCK_EVENTS: ComplaintEvent[] = [
  { id: 1, complaint_id: c1, type: "created", from_status: null, to_status: "submitted", note_en: null, note_as: null, actor_name: "Priya Gogoi", created_at: ago(19) },
  { id: 2, complaint_id: c1, type: "ai", from_status: null, to_status: null, note_en: "AI summarised the report in English and Assamese", note_as: "এআই-এ অভিযোগটো ইংৰাজী আৰু অসমীয়াত চমুকৈ লিখিলে", actor_name: null, created_at: ago(19) },
  { id: 3, complaint_id: c1, type: "status", from_status: "submitted", to_status: "triaged", note_en: `Routed to ${W.name_en}`, note_as: `${W.name_as} বিভাগলৈ পঠিওৱা হ'ল`, actor_name: null, created_at: ago(19) },
  { id: 4, complaint_id: c1, type: "metoo", from_status: null, to_status: null, note_en: "Rahul Sharma reported the same issue", note_as: "Rahul Sharma-এ একে সমস্যাৰ কথা জনালে", actor_name: null, created_at: ago(3) },
  { id: 5, complaint_id: c1, type: "assigned", from_status: "triaged", to_status: "assigned", note_en: "Assigned to Bikash Saikia", note_as: "Bikash Saikia-ক দায়িত্ব দিয়া হ'ল", actor_name: "R. Dutta", created_at: ago(2) },
  { id: 6, complaint_id: c3, type: "created", from_status: null, to_status: "submitted", note_en: null, note_as: null, actor_name: null, created_at: ago(30) },
  { id: 7, complaint_id: c3, type: "status", from_status: "assigned", to_status: "in_progress", note_en: "Work started", note_as: "কাম আৰম্ভ হ'ল", actor_name: "Bikash Saikia", created_at: ago(6) },
  { id: 8, complaint_id: c5, type: "status", from_status: "in_progress", to_status: "resolved", note_en: "Bin emptied and area cleaned", note_as: "ডাষ্টবিন খালী কৰি ঠাইখিনি চাফা কৰা হ'ল", actor_name: "Bikash Saikia", created_at: ago(1) },
];

export const MOCK_NOTIFICATIONS: Notification[] = [
  { id: 1, complaint_id: c1, title_en: `Your report ${MOCK_COMPLAINTS[0].code} was routed to ${W.name_en}`, title_as: `আপোনাৰ অভিযোগ ${MOCK_COMPLAINTS[0].code} ${W.name_as} বিভাগলৈ পঠিওৱা হ'ল`, read: false, created_at: ago(19) },
  { id: 2, complaint_id: c1, title_en: "5 people supported your report", title_as: "৫ জনে আপোনাৰ অভিযোগ সমৰ্থন কৰিছে", read: false, created_at: ago(4) },
  { id: 3, complaint_id: c3, title_en: `Work has started on ${MOCK_COMPLAINTS[2].code}`, title_as: `${MOCK_COMPLAINTS[2].code}-ৰ কাম আৰম্ভ হৈছে`, read: true, created_at: ago(6) },
  { id: 4, complaint_id: c5, title_en: "Your report was resolved — please confirm it is fixed", title_as: "আপোনাৰ অভিযোগৰ সমাধান হ'ল — অনুগ্ৰহ কৰি নিশ্চিত কৰক", read: false, created_at: ago(1) },
];

export const MOCK_MESSAGES: Message[] = [
  { id: 1, complaint_id: c1, sender: { id: MOCK_PEOPLE.priya.id, full_name: "Priya Gogoi", role: "student" }, body: "কেতিয়ালৈকে পানী আহিব?", lang: "as", body_translated: "When will the water be back?", internal: false, created_at: ago(5) },
  { id: 2, complaint_id: c1, sender: { id: MOCK_PEOPLE.dutta.id, full_name: "R. Dutta", role: "dept_admin" }, body: "A plumber is on the way. Water should be back by this evening.", lang: "en", body_translated: "এজন প্লাম্বাৰ আহি আছে। আজি সন্ধিয়ালৈ পানী আহিব।", internal: false, created_at: ago(2) },
  { id: 3, complaint_id: c1, sender: { id: MOCK_PEOPLE.bikash.id, full_name: "Bikash Saikia", role: "field_staff" }, body: "টেংক ২-ৰ পাম্প মটৰ জ্বলি গৈছে।", lang: "as", body_translated: "The pump motor of tank 2 has burnt out.", internal: true, created_at: ago(1.5) },
];

/* ============================== Detail ============================== */

export function getMockComplaint(id: string): ComplaintDetail | null {
  const c = MOCK_COMPLAINTS.find((x) => x.id === id || x.code === id);
  if (!c) return null;
  const dept = MOCK_DEPARTMENTS.find((d) => d.id === c.department_id) ?? null;
  const assignee = Object.values(MOCK_PEOPLE).find((p) => p.id === c.assignee_id) ?? null;
  const resolved = c.status === "resolved" || c.status === "closed";
  return {
    ...c,
    original_text: ORIGINAL_TEXT.get(c.id) ?? "",
    location_note: c.id === c1 ? "Ground floor, block B" : null,
    photo_urls: c.photo_url ? [c.photo_url] : [],
    department: dept && { id: dept.id, name_en: dept.name_en, name_as: dept.name_as },
    assignee,
    reporter: c.anonymous ? null : c.original_lang === "as" ? MOCK_PEOPLE.priya : MOCK_PEOPLE.rahul,
    ai_meta: { source: "ai", model: "gemini-flash-latest", confidence: 0.91, priority_reason_en: "Basic need affecting many residents", ms: 2140 },
    resolution_note_en: resolved ? "Bin emptied and area cleaned" : null,
    resolution_note_as: resolved ? "ডাষ্টবিন খালী কৰি ঠাইখিনি চাফা কৰা হ'ল" : null,
    resolution_photo_url: null,
    resolved_at: resolved ? ago(1) : null,
    rating: c.status === "closed" ? 4 : null,
    verified_by_reporter: c.status === "closed" ? true : null,
    supported: false,
    events: MOCK_EVENTS.filter((e) => e.complaint_id === c.id),
  };
}

export type MockListParams = { scope?: "mine" | "public" | "dept" | "assigned"; status?: Status[]; q?: string; lang?: Lang };

/** `GET /api/complaints` with the common filters applied in memory. */
export function getMockComplaints({ scope = "public", status, q, lang }: MockListParams = {}): Paginated<ComplaintListItem> {
  let items = MOCK_COMPLAINTS;
  if (scope === "public") items = items.filter((c) => c.visibility === "public" && !c.is_sensitive && !c.parent_id);
  if (scope === "assigned") items = items.filter((c) => c.assignee_id === MOCK_PEOPLE.bikash.id);
  if (scope === "dept") items = items.filter((c) => c.department_id === W.id);
  if (scope === "mine") items = items.filter((c) => c.original_lang === "as" && !c.anonymous);
  if (status?.length) items = items.filter((c) => status.includes(c.status));
  if (lang) items = items.filter((c) => c.original_lang === lang);
  if (q) {
    const needle = q.toLowerCase();
    items = items.filter((c) => [c.code, c.title_en, c.title_as].some((v) => v?.toLowerCase().includes(needle)));
  }
  return { items: [...items].sort((a, b) => b.created_at.localeCompare(a.created_at)), nextCursor: null };
}

/* ============================== Report flow ============================== */

export const MOCK_ANALYZE: AnalyzeResult = {
  intake: {
    title_en: "No water in Girls Hostel washroom for three days",
    title_as: "ছোৱালী হোষ্টেলৰ বাথৰুমত তিনিদিন ধৰি পানী নাই",
    summary_en: "The washroom taps in the Girls Hostel have had no water supply for three days.",
    summary_as: "ছোৱালী হোষ্টেলৰ বাথৰুমৰ কলত তিনিদিন ধৰি পানীৰ যোগান নাই।",
    category: "water_supply",
    priority: 2,
    priority_reason_en: "Basic need affecting many residents for several days",
    location_hint: "Girls Hostel",
    is_abusive: false,
    has_personal_data: false,
    is_urgent: false,
    is_sensitive_suggested: false,
    confidence: 0.91,
  },
  source: "ai",
  model: "gemini-flash-latest",
  ms: 2140,
};

export const MOCK_SIMILAR: SimilarItem[] = [
  { id: c1, code: MOCK_COMPLAINTS[0].code, title_en: MOCK_COMPLAINTS[0].title_en, title_as: MOCK_COMPLAINTS[0].title_as, status: "assigned", metoo_count: 6, similarity: 0.93 },
  { id: MOCK_COMPLAINTS[2].id, code: MOCK_COMPLAINTS[2].code, title_en: MOCK_COMPLAINTS[2].title_en, title_as: MOCK_COMPLAINTS[2].title_as, status: "in_progress", metoo_count: 3, similarity: 0.81 },
];

export const MOCK_SUBMIT: SubmitResult = {
  id: c1,
  code: MOCK_COMPLAINTS[0].code,
  department: { id: W.id, name_en: W.name_en, name_as: W.name_as },
  sla_due_at: ahead(24),
  status: "triaged",
  is_urgent: false,
};

export const MOCK_UPLOAD = { path: `${MOCK_PEOPLE.priya.id}/${uid("f0000000", 1)}.webp` };

export const MOCK_PUBLIC_CONFIG: PublicConfig = {
  campus_security: { phone: "", label_en: "Campus security", label_as: "কেম্পাছ সুৰক্ষা" },
  campus_emergency: { phone: "", label_en: "Medical emergency", label_as: "চিকিৎসা জৰুৰীকালীন" },
};

export const MOCK_SUPPORT = { metoo_count: 7 };

export const MOCK_REPLY_DRAFT: ReplyDraft = {
  text: "নমস্কাৰ, আপোনাৰ অভিযোগটো পোৱা গৈছে। আমাৰ কৰ্মীয়ে পাম্পটো মেৰামতি কৰি আছে আৰু আজি সন্ধিয়ালৈ পানীৰ যোগান পুনৰ আৰম্ভ হ'ব।",
  lang: "as",
};

export const MOCK_RESOLUTION_CHECK: ResolutionCheck = {
  verdict: "resolved",
  reason_en: "The after photo shows the bin emptied and the area clean.",
  reason_as: "পিছৰ ফটোত ডাষ্টবিনটো খালী আৰু ঠাইখিনি চাফা দেখা গৈছে।",
};

/* ============================== Meta ============================== */

export const MOCK_TRANSITIONS: Transition[] = (
  [
    ["submitted", "triaged"], ["submitted", "needs_review"], ["submitted", "duplicate"], ["submitted", "rejected"],
    ["needs_review", "triaged"], ["needs_review", "rejected"], ["needs_review", "duplicate"],
    ["triaged", "assigned"], ["triaged", "duplicate"], ["triaged", "rejected"],
    ["assigned", "in_progress"], ["assigned", "triaged"],
    ["in_progress", "resolved"], ["in_progress", "assigned"],
    ["resolved", "closed"], ["resolved", "in_progress"],
    ["closed", "in_progress"],
    ["duplicate", "triaged"],
  ] as const
).map(([from, to]) => ({ from, to }));

export const nextStatuses = (from: Status) => MOCK_TRANSITIONS.filter((t) => t.from === from).map((t) => t.to);

/* ============================== Admin dashboard ============================== */

export const MOCK_TREND: TrendPoint[] = [3, 5, 4, 6, 2, 7, 9, 5, 6, 8, 4, 10, 7, 9].map((created, i) => ({
  day: new Date(NOW - (13 - i) * 24 * HOUR).toISOString().slice(0, 10),
  created,
  resolved: Math.max(0, created - ((i * 7) % 4)),
}));

export const MOCK_CATEGORIES: CategoryCount[] = [
  { category: "water_supply", total: 14 }, { category: "electrical", total: 9 }, { category: "sanitation", total: 8 },
  { category: "plumbing", total: 7 }, { category: "hostel", total: 6 }, { category: "it_network", total: 5 },
  { category: "mess_food", total: 4 }, { category: "infrastructure", total: 3 }, { category: "transport", total: 3 },
  { category: "safety_security", total: 2 }, { category: "academic", total: 2 }, { category: "other", total: 1 },
];

export const MOCK_DEPARTMENT_LOAD: DepartmentLoad[] = MOCK_DEPARTMENTS.map((d, i) => ({
  department_id: d.id, name_en: d.name_en, name_as: d.name_as, open_count: [6, 4, 11, 5, 3, 1, 2, 2][i], overdue: [1, 2, 3, 0, 0, 0, 1, 0][i],
}));

export const MOCK_TOP_LOCATIONS: TopLocation[] = [8, 7, 1, 9, 3].map((n, i) => ({
  location_id: LOC(n).id, name_en: LOC(n).name_en, name_as: LOC(n).name_as, open_count: [9, 6, 4, 3, 2][i], total: [14, 9, 7, 5, 4][i],
}));

export const MOCK_STATS: DashboardStats = {
  open: 34, in_progress: 8, resolved: 61, overdue: 7, contributors: 48, avg_resolution_hours: 31,
  by_lang: { en: 52, as: 51 }, resolved_this_week: 19, satisfaction: 4.3,
};

export const MOCK_ADMIN_STATS: AdminStats = {
  stats: MOCK_STATS, trend: MOCK_TREND, categories: MOCK_CATEGORIES, load: MOCK_DEPARTMENT_LOAD, top_locations: MOCK_TOP_LOCATIONS,
};

export const MOCK_BRIEF: DailyBrief = {
  en: [
    "Water complaints from the Girls Hostel doubled in the last 24 hours (6 reports).",
    "2 critical electrical issues are past their SLA — both in the Boys Hostel.",
    "Water & Sanitation resolved 5 tickets yesterday, the fastest this week.",
  ],
  as: [
    "যোৱা ২৪ ঘণ্টাত ছোৱালী হোষ্টেলৰ পৰা পানীৰ অভিযোগ দুগুণ হৈছে (৬টা অভিযোগ)।",
    "২টা অতি জৰুৰী বিদ্যুৎ সম্পৰ্কীয় অভিযোগৰ সময়সীমা পাৰ হৈছে — দুয়োটা ল'ৰা হোষ্টেলত।",
    "কালি পানী আৰু চাফাই বিভাগে ৫টা অভিযোগ সমাধান কৰিছে, এই সপ্তাহৰ আটাইতকৈ দ্ৰুত।",
  ],
  generated_at: ago(0.5),
};

/* ============================== System panel ============================== */

export const MOCK_SYS_KEYS: SysKey[] = [
  { id: uid("e0000000", 1), label: "gemini-1", provider: "google", last4: "x7Qa", enabled: true, rpm_limit: 10, simulate_failure: false, status: "ok", fail_count: 0, cooldown_until: null, last_used_at: ago(0.05) },
  { id: uid("e0000000", 2), label: "gemini-2", provider: "google", last4: "P0dc", enabled: true, rpm_limit: 10, simulate_failure: true, status: "failing", fail_count: 4, cooldown_until: null, last_used_at: ago(0.1) },
  { id: uid("e0000000", 3), label: "gemini-3", provider: "google", last4: "9kLm", enabled: true, rpm_limit: 10, simulate_failure: false, status: "cooldown", fail_count: 2, cooldown_until: ahead(0.02), last_used_at: ago(0.2) },
  { id: uid("e0000000", 4), label: "gemini-4", provider: "google", last4: "Tz31", enabled: false, rpm_limit: 10, simulate_failure: false, status: "disabled", fail_count: 0, cooldown_until: null, last_used_at: ago(30) },
  { id: uid("e0000000", 5), label: "openrouter-1", provider: "openrouter", last4: "a1B2", enabled: true, rpm_limit: 20, simulate_failure: false, status: "ok", fail_count: 0, cooldown_until: null, last_used_at: ago(1) },
];

export const MOCK_SYS_MODELS: SysModel[] = (
  [
    ["google", "gemini-flash-latest", "intake", 10, ["vision", "assamese", "json"]],
    ["google", "gemini-flash-lite-latest", "intake", 20, ["vision", "assamese", "json"]],
    ["openrouter", "auto:free", "intake", 90, ["vision", "assamese", "json"]],
    ["google", "gemini-embedding-001", "embed", 10, ["embed"]],
    ["google", "gemini-flash-lite-latest", "dedup_verify", 10, ["assamese", "json"]],
    ["google", "gemini-flash-latest", "agent", 10, ["tools", "assamese"]],
    ["openrouter", "auto:free", "agent", 90, ["tools", "assamese"]],
    ["google", "gemini-flash-latest", "reply_draft", 10, ["assamese"]],
    ["google", "gemini-flash-lite-latest", "translate_msg", 10, ["assamese"]],
    ["google", "gemini-flash-latest", "resolution_check", 10, ["vision", "json"]],
    ["google", "gemini-flash-latest", "daily_brief", 10, ["assamese"]],
  ] as const
).map(([provider, model, purpose, priority, caps], i) => ({
  id: uid("b0000000", i + 1), provider, model, purpose, priority, caps: [...caps], enabled: true,
}));

export const MOCK_SYS_LOGS: SysLog[] = [
  { id: 105, request_id: "req-5", purpose: "intake", provider: "google", model: "gemini-flash-latest", key_label: "gemini-2", latency_ms: 180, status: "rate_limited", error: "429 simulated failure", created_at: ago(0.05) },
  { id: 106, request_id: "req-5", purpose: "intake", provider: "google", model: "gemini-flash-latest", key_label: "gemini-1", latency_ms: 2310, status: "ok", error: null, created_at: ago(0.05) },
  { id: 104, request_id: "req-4", purpose: "embed", provider: "google", model: "gemini-embedding-001", key_label: "gemini-1", latency_ms: 240, status: "ok", error: null, created_at: ago(0.3) },
  { id: 101, request_id: "req-3", purpose: "intake", provider: "google", model: "gemini-flash-latest", key_label: "gemini-3", latency_ms: 8000, status: "timeout", error: "deadline exceeded", created_at: ago(1) },
  { id: 102, request_id: "req-3", purpose: "intake", provider: "google", model: "gemini-flash-lite-latest", key_label: "gemini-1", latency_ms: 0, status: "invalid", error: "Bengali drift (U+09B0) in Assamese output", created_at: ago(1) },
  { id: 103, request_id: "req-3", purpose: "intake", provider: "openrouter", model: "meta-llama/llama-4-maverick:free", key_label: "openrouter-1", latency_ms: 3900, status: "ok", error: null, created_at: ago(1) },
  { id: 100, request_id: "req-2", purpose: "daily_brief", provider: "google", model: "gemini-flash-latest", key_label: "gemini-1", latency_ms: 1720, status: "ok", error: null, created_at: ago(2) },
];

export const MOCK_SYS_HEALTH: SysHealth = {
  models: [
    { purpose: "intake", provider: "google", model: "gemini-flash-latest", calls: 100, success_rate: 0.94, p50_ms: 2100, p95_ms: 4800, last_error: "429 simulated failure" },
    { purpose: "intake", provider: "openrouter", model: "auto:free", calls: 9, success_rate: 0.78, p50_ms: 3900, p95_ms: 7200, last_error: "provider overloaded" },
    { purpose: "embed", provider: "google", model: "gemini-embedding-001", calls: 100, success_rate: 1, p50_ms: 230, p95_ms: 410, last_error: null },
    { purpose: "agent", provider: "google", model: "gemini-flash-latest", calls: 22, success_rate: 0.95, p50_ms: 3400, p95_ms: 6900, last_error: null },
  ],
  keys: MOCK_SYS_KEYS.map((k, i) => ({ label: k.label, provider: k.provider, calls_per_min: [6, 1, 0, 0, 2][i], cooldown_until: k.cooldown_until, failures: k.fail_count })),
  generated_at: ago(0),
};

export const MOCK_SYS_TEST: SysTestResult = {
  purpose: "intake",
  output: JSON.stringify(MOCK_ANALYZE.intake, null, 2),
  attempts: [
    { provider: "google", model: "gemini-flash-latest", key_label: "gemini-2", status: "rate_limited", latency_ms: 170 },
    { provider: "google", model: "gemini-flash-latest", key_label: "gemini-1", status: "ok", latency_ms: 2240 },
  ],
};
