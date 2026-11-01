"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  Building2, CalendarClock, ChevronLeft, ExternalLink, Link2, Lock, MapPin, Send, ShieldAlert, Siren, Unlink, UserRound, Wrench,
} from "lucide-react";
import {
  CATEGORIES, OPEN_STATUSES,
  type AdminSimilarItem, type AssigneeSuggestion, type ComplaintDetail, type ComplaintPatch, type ComplaintUpdateResult, type InternalNote, type NamedRef,
  type StaffMember, type Status, type TimelineEvent,
} from "@/lib/domain";
import { cn, toLocaleDigits } from "@/lib/utils";
import {
  Button, Card, CardHeader, CategoryChip, Chip, Dialog, EmptyState, ErrorState, LangText, LifecycleTrack, ListSkeleton, PriorityChip,
  RelativeTime, Select, StatusChip, Switch, Tabs, Textarea, Timeline, type TimelineItem,
} from "@/components/ui";
import { apiFetch, isApiError } from "@/components/api-client";
import { useRealtime } from "@/components/use-realtime";
import { EvidenceGallery } from "@/components/ticket/evidence-gallery";
import { SlaCountdown } from "@/components/ticket/sla-countdown";
import { ResolveDrawer } from "@/components/staff/resolve-drawer";
import { TicketChat } from "@/components/chat/ticket-chat";
import { ReplyDraftPanel } from "@/components/assist/reply-draft-panel";
import { ResolutionCheckPanel } from "@/components/assist/resolution-check-panel";
import { CivicShieldCard } from "./civicshield-card";

const KNOWN_EVENTS = ["created", "status", "assigned", "note", "metoo", "ai"];
const isOpen = (s: Status) => (OPEN_STATUSES as readonly Status[]).includes(s);

/** Toast text for an API failure. */
function useErrorText() {
  const t = useTranslations("workspace.errors");
  return (e: unknown) => {
    if (isApiError(e, "INVALID_TRANSITION")) return t("transition");
    if (isApiError(e, "FORBIDDEN")) return t("forbidden");
    if (isApiError(e, "VALIDATION_ERROR")) return e.message;
    if (isApiError(e, "NOT_FOUND")) return t("notFound");
    return t("generic");
  };
}

function SummaryCard({ d }: { d: ComplaintDetail }) {
  const t = useTranslations("workspace");
  const locale = useLocale();
  const [tab, setTab] = useState<"en" | "as" | "original">(locale === "as" ? "as" : "en");
  return (
    <Card>
      <CardHeader title={t("summary")} className="mb-4" />
      <Tabs<"en" | "as" | "original">
        label={t("summary")}
        value={tab}
        onValueChange={setTab}
        items={[
          { value: "en", label: t("tabEn") },
          { value: "as", label: t("tabAs") },
          { value: "original", label: t("tabOriginal") },
        ]}
      />
      <div className="mt-4 text-sm leading-relaxed">
        {tab === "original" ? (
          d.original_text ? (
            <p lang={d.original_lang ?? undefined} className="whitespace-pre-wrap">{d.original_text}</p>
          ) : (
            <p className="text-muted-foreground">{t("noOriginal")}</p>
          )
        ) : (
          <>
            <p lang={tab} className="font-semibold">{(tab === "as" ? d.title_as : d.title_en) || "—"}</p>
            <p lang={tab} className="mt-1.5 text-muted-foreground">{(tab === "as" ? d.summary_as : d.summary_en) || t("noSummary")}</p>
          </>
        )}
      </div>
    </Card>
  );
}

function AiCard({ d }: { d: ComplaintDetail }) {
  const t = useTranslations("workspace.ai");
  const locale = useLocale();
  if (!d.ai) return null;
  const rows = [
    { k: t("status"), v: t(`state.${["done", "pending", "failed", "fallback"].includes(d.ai.status) ? d.ai.status : "pending"}`) },
    { k: t("model"), v: d.ai.model ?? "—" },
    { k: t("confidence"), v: d.ai.confidence != null ? `${toLocaleDigits(Math.round(d.ai.confidence * 100), locale)}%` : "—" },
    { k: t("routing"), v: d.ai.auto_routed == null ? "—" : d.ai.auto_routed ? t("autoRouted") : t("manualReview") },
  ];
  return (
    <Card>
      <CardHeader title={t("title")} description={t("body")} className="mb-3" />
      <dl className="divide-y divide-border text-sm">
        {rows.map((r) => (
          <div key={r.k} className="flex items-baseline justify-between gap-4 py-2.5">
            <dt className="text-muted-foreground">{r.k}</dt>
            <dd className="min-w-0 truncate text-right font-medium">{r.v}</dd>
          </div>
        ))}
      </dl>
      {d.ai.priority_reason_en && (
        <p className="mt-3 rounded-xl bg-surface-muted px-3.5 py-2.5 text-sm text-muted-foreground" lang="en">
          <span className="font-medium text-foreground">{t("priorityReason")}: </span>
          {d.ai.priority_reason_en}
        </p>
      )}
      {d.ai.location_review === "nearby_outside_campus" && (
        <p className="mt-3 flex items-start gap-2 rounded-xl border border-warning/40 bg-warning-soft px-3.5 py-2.5 text-sm text-foreground">
          <MapPin className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
          {t("nearbyLocation")}
        </p>
      )}
    </Card>
  );
}

function NotesCard({ id }: { id: string }) {
  const t = useTranslations("workspace.notes");
  const qc = useQueryClient();
  const errText = useErrorText();
  const [body, setBody] = useState("");
  const key = ["notes", id] as const;
  const notes = useQuery({
    queryKey: key,
    queryFn: ({ signal }) => apiFetch<InternalNote[]>(`/api/complaints/${encodeURIComponent(id)}/notes`, { signal }),
  });
  const add = useMutation({
    mutationFn: (text: string) => apiFetch<InternalNote>(`/api/complaints/${encodeURIComponent(id)}/notes`, { method: "POST", json: { body: text } }),
    onSuccess: () => {
      setBody("");
      void qc.invalidateQueries({ queryKey: key });
    },
    onError: (e) => toast.error(errText(e)),
  });
  return (
    <Card>
      <CardHeader title={t("title")} description={t("body")} className="mb-4" />
      {notes.isPending ? (
        <ListSkeleton rows={2} />
      ) : notes.isError ? (
        <ErrorState bare className="py-4" onRetry={() => void notes.refetch()} retrying={notes.isFetching} />
      ) : notes.data.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("empty")}</p>
      ) : (
        <ul className="space-y-3">
          {notes.data.map((n) => (
            <li key={n.id} className="rounded-xl bg-surface-muted px-3.5 py-2.5">
              <p className="text-xs text-muted-foreground">
                <span className="font-medium text-foreground">{n.mine ? t("you") : (n.author ?? t("staff"))}</span> · <RelativeTime date={n.created_at} />
              </p>
              <p className="mt-1 text-sm whitespace-pre-wrap">{n.body}</p>
            </li>
          ))}
        </ul>
      )}
      <form
        className="mt-4 space-y-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (body.trim()) add.mutate(body.trim());
        }}
      >
        <Textarea id={`note-${id}`} label={t("label")} value={body} onChange={(e) => setBody(e.target.value)} rows={2} maxLength={1000} className="min-h-20" />
        <div className="flex justify-end">
          <Button type="submit" size="sm" variant="secondary" loading={add.isPending} disabled={!body.trim()}>
            {t("add")}
          </Button>
        </div>
      </form>
    </Card>
  );
}

function SimilarCard({ d, onLink, onUnlink, busy }: { d: ComplaintDetail; onLink: (parentId: string) => void; onUnlink: () => void; busy: boolean }) {
  const t = useTranslations("workspace.similar");
  const locale = useLocale();
  const parent = d.admin?.parent ?? null;
  const canSearch = !parent && (d.status === "submitted" || d.status === "needs_review" || d.status === "triaged");
  const similar = useQuery({
    queryKey: ["similar", d.id],
    queryFn: ({ signal }) => apiFetch<AdminSimilarItem[]>(`/api/complaints/${encodeURIComponent(d.id)}/similar`, { signal }),
    enabled: canSearch,
    staleTime: 60_000,
    retry: (count, e) => !isApiError(e, "AI_UNAVAILABLE") && count < 1,
  });

  return (
    <Card>
      <CardHeader title={t("title")} description={parent ? t("linkedBody") : t("body")} className="mb-4" />
      {parent ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border px-3.5 py-3">
          <Link href={`/admin/t/${parent.id}`} className="min-w-0 text-sm hover:underline">
            <span className="font-mono text-xs font-semibold tracking-wider text-muted-foreground">{parent.code}</span>
            <LangText tag="span" en={parent.title_en} as={parent.title_as} className="ml-2 font-medium" />
          </Link>
          <Button size="sm" variant="secondary" onClick={onUnlink} loading={busy}>
            {!busy && <Unlink aria-hidden />}
            {t("unlink")}
          </Button>
        </div>
      ) : !canSearch ? (
        <p className="text-sm text-muted-foreground">{t("notNow")}</p>
      ) : similar.isPending ? (
        <ListSkeleton rows={2} />
      ) : similar.isError ? (
        isApiError(similar.error, "AI_UNAVAILABLE") ? (
          <p className="text-sm text-muted-foreground">{t("unavailable")}</p>
        ) : (
          <ErrorState bare className="py-4" onRetry={() => void similar.refetch()} retrying={similar.isFetching} />
        )
      ) : similar.data.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("none")}</p>
      ) : (
        <ul className="divide-y divide-border">
          {similar.data.map((s) => (
            <li key={s.id} className="flex items-center gap-3 py-3">
              <Link href={`/admin/t/${s.id}`} className="min-w-0 flex-1 text-sm hover:underline">
                <span className="flex items-center gap-2">
                  <span className="font-mono text-xs font-semibold tracking-wider text-muted-foreground">{s.code}</span>
                  <span className="tabular text-xs text-muted-foreground">{t("match", { n: toLocaleDigits(Math.round(s.similarity * 100), locale) })}</span>
                </span>
                <LangText tag="span" en={s.title_en} as={s.title_as} fallback={s.code} className="mt-0.5 line-clamp-2 block font-medium" />
              </Link>
              <Button size="sm" variant="secondary" onClick={() => onLink(s.id)} disabled={busy} aria-label={t("linkAria", { code: s.code })}>
                <Link2 aria-hidden />
                {t("link")}
              </Button>
            </li>
          ))}
        </ul>
      )}
      {(d.admin?.duplicates.length ?? 0) > 0 && (
        <div className="mt-4 border-t border-border pt-4">
          <p className="text-xs font-medium text-muted-foreground">{t("merged", { n: toLocaleDigits(d.admin!.duplicates.length, locale) })}</p>
          <ul className="mt-2 flex flex-wrap gap-2">
            {d.admin!.duplicates.map((c) => (
              <li key={c.id}>
                <Link href={`/admin/t/${c.id}`} className="inline-flex h-7 items-center rounded-full border border-border px-2.5 font-mono text-xs font-semibold hover:bg-surface-muted">
                  {c.code}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}

/** Ranked field staff (skills + buildings + load) with one-click Assign, plus the auto-assignment reason. */
function AssigneeSuggestions({ d, enabled, busy, onAssign }: { d: ComplaintDetail; enabled: boolean; busy: boolean; onAssign: (id: string) => void }) {
  const t = useTranslations("assign");
  const tx = useTranslations("members.experience");
  const tc = useTranslations("category");
  const locale = useLocale();
  const auto = d.admin?.auto_assign ?? null;
  const currentId = d.admin?.assignee?.id ?? null;
  const q = useQuery({
    queryKey: ["assignees", d.id],
    queryFn: ({ signal }) => apiFetch<AssigneeSuggestion[]>(`/api/complaints/${encodeURIComponent(d.id)}/assignees`, { signal }),
    enabled,
    staleTime: 30_000,
  });
  const place = d.location ? (locale === "as" ? d.location.name_as : d.location.name_en) : null;
  const reasonText = (r: AssigneeSuggestion["reasons"]) =>
    [
      tx(`level.${r.level}`) + (r.fit ? ` · ${t("fit")}` : ""),
      r.skill ? tc(d.category) : null,
      r.covers && place ? t("covers", { place }) : null,
      t("openJobs", { count: r.open_jobs, n: toLocaleDigits(r.open_jobs, locale) }),
    ]
      .filter(Boolean)
      .join(" · ");

  return (
    <div className="space-y-3">
      {auto && (
        <div className="rounded-xl bg-surface-muted px-3.5 py-2.5 text-sm">
          <Chip tone="accent">{t("autoChip")}</Chip>
          <LangText tag="p" en={auto.note_en} as={auto.note_as} className="mt-1.5 text-muted-foreground" />
        </div>
      )}
      {enabled && (
        <div>
          <p className="text-sm font-medium">{t("suggestions")}</p>
          <p className="text-xs text-muted-foreground">{t("suggestionsBody")}</p>
          {q.isPending ? (
            <ListSkeleton rows={2} />
          ) : q.isError ? (
            <ErrorState bare className="py-3" title={t("error")} onRetry={() => void q.refetch()} retrying={q.isFetching} />
          ) : q.data.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">{t("none")}</p>
          ) : (
            <ul className="mt-1 divide-y divide-border">
              {q.data.map((s, i) => (
                <li key={s.id} className="flex items-center gap-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {s.name || t("noName")}
                      {i === 0 && <span className="ml-1.5 text-xs font-normal text-muted-foreground">{t("best")}</span>}
                    </p>
                    <p className="truncate text-xs text-muted-foreground tabular">{reasonText(s.reasons)}</p>
                  </div>
                  {s.id === currentId ? (
                    <span className="text-xs text-muted-foreground">{t("current")}</span>
                  ) : (
                    <Button size="sm" variant={i === 0 ? "primary" : "secondary"} disabled={busy} onClick={() => onAssign(s.id)} aria-label={t("assignAria", { name: s.name || t("noName") })}>
                      {t("assign")}
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

/** Workflow suggestion (assign mode "approval"): who, how sure, and one-click approve or dismiss. */
function ProposalCard({ d, busy, onDone }: { d: ComplaintDetail; busy: boolean; onDone: () => void }) {
  const t = useTranslations("assign.proposal");
  const tx = useTranslations("members.experience");
  const locale = useLocale();
  const errText = useErrorText();
  const p = d.admin?.proposal;
  const decide = useMutation({
    mutationFn: (approve: boolean) =>
      apiFetch(`/api/complaints/${encodeURIComponent(d.id)}/proposal`, { method: "POST", json: { approve } }),
    onSuccess: (_r, approve) => {
      toast.success(approve ? t("approved") : t("dismissed"));
      onDone();
    },
    onError: (e) => toast.error(errText(e)),
  });
  if (!p) return null;
  const pct = Math.round(p.confidence * 100);
  return (
    <div className="rounded-xl border border-border-strong bg-surface-muted px-3.5 py-3">
      <p className="text-xs font-medium text-muted-foreground">{t("title")}</p>
      <p className="mt-1 flex flex-wrap items-center gap-2 text-sm font-medium">
        {p.name || t("noName")}
        <Chip tone={p.level >= 3 ? "primary" : "neutral"}>{tx(`level.${p.level}`)}</Chip>
        <span className="text-xs font-normal text-muted-foreground tabular">{t("confidence", { n: toLocaleDigits(pct, locale) })}</span>
      </p>
      <LangText tag="p" en={p.note_en} as={p.note_as} className="mt-1 text-xs text-muted-foreground" />
      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" disabled={busy || decide.isPending} loading={decide.isPending && decide.variables === true} onClick={() => decide.mutate(true)}>
          {t("approve")}
        </Button>
        <Button size="sm" variant="ghost" disabled={busy || decide.isPending} loading={decide.isPending && decide.variables === false} onClick={() => decide.mutate(false)}>
          {t("dismiss")}
        </Button>
      </div>
    </div>
  );
}

/** Extra people on the job besides the lead (fights, harassment, big repairs). */
function TeamCard({ d, staff, busy, onDone }: { d: ComplaintDetail; staff: StaffMember[]; busy: boolean; onDone: () => void }) {
  const t = useTranslations("assign.team");
  const errText = useErrorText();
  const helpers = d.admin?.helpers ?? [];
  const leadId = d.admin?.assignee?.id ?? null;
  const sensitive = Boolean(d.admin?.is_sensitive);
  const candidates = staff.filter((m) => m.id !== leadId && !helpers.some((h) => h.id === m.id) && (!sensitive || m.role === "dept_admin"));
  const change = useMutation({
    mutationFn: (v: { add?: string; remove?: string }) =>
      v.add
        ? apiFetch(`/api/complaints/${encodeURIComponent(d.id)}/helpers`, { method: "POST", json: { user_id: v.add } })
        : apiFetch(`/api/complaints/${encodeURIComponent(d.id)}/helpers?user=${encodeURIComponent(v.remove!)}`, { method: "DELETE" }),
    onSuccess: (_r, v) => {
      toast.success(v.add ? t("added") : t("removed"));
      onDone();
    },
    onError: (e) => toast.error(errText(e)),
  });
  if (!leadId) return null;
  return (
    <div>
      <p className="text-sm font-medium">{t("title")}</p>
      <p className="text-xs text-muted-foreground">{t("body")}</p>
      {helpers.length > 0 && (
        <ul className="mt-2 divide-y divide-border">
          {helpers.map((h) => (
            <li key={h.id} className="flex items-center gap-3 py-2">
              <span className="min-w-0 flex-1 truncate text-sm">{h.name || t("noName")}</span>
              <Button size="sm" variant="ghost" disabled={busy || change.isPending} onClick={() => change.mutate({ remove: h.id })}>
                {t("remove")}
              </Button>
            </li>
          ))}
        </ul>
      )}
      {candidates.length > 0 && (
        <Select
          id="ws-helper"
          className="mt-2"
          label={t("add")}
          value=""
          placeholder={t("pick")}
          disabled={busy || change.isPending}
          onChange={(e) => e.target.value && change.mutate({ add: e.target.value })}
          options={candidates.map((m) => ({ value: m.id, label: m.full_name || t("noName") }))}
        />
      )}
    </div>
  );
}

/** S15 — admin ticket workspace. Left: the ticket; right rail: actions. Every action → API → toast → refetch. */
export function Workspace({ initial, departments, isSuper }: { initial: ComplaintDetail; departments: NamedRef[]; isSuper: boolean }) {
  const t = useTranslations("workspace");
  const tt = useTranslations("ticket");
  const ts = useTranslations("status");
  const tc = useTranslations("category");
  const tp = useTranslations("priority");
  const locale = useLocale();
  const router = useRouter();
  const qc = useQueryClient();
  const errText = useErrorText();
  const id = initial.id;
  const key = ["complaint", id] as const;

  const query = useQuery({
    queryKey: key,
    queryFn: ({ signal }) => apiFetch<ComplaintDetail>(`/api/complaints/${encodeURIComponent(id)}`, { signal }),
    initialData: initial,
    staleTime: 10_000,
    retry: (count, e) => !isApiError(e, "NOT_FOUND") && count < 2,
  });
  useRealtime(
    `workspace-${id}`,
    [
      { table: "complaints", filter: `id=eq.${id}`, event: "UPDATE" },
      { table: "complaint_events", filter: `complaint_id=eq.${id}`, event: "INSERT" },
    ],
    () => void qc.invalidateQueries({ queryKey: key }),
  );

  const d = query.data;
  const departmentId = d.admin?.department_id ?? null;
  const staff = useQuery({
    queryKey: ["staff", departmentId],
    queryFn: ({ signal }) => apiFetch<StaffMember[]>(`/api/admin/staff?department=${departmentId}`, { signal }),
    enabled: Boolean(departmentId),
    staleTime: 5 * 60_000,
  });

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: key });
    void qc.invalidateQueries({ queryKey: ["complaints", "dept"] });
    void qc.invalidateQueries({ queryKey: ["similar", id] });
    void qc.invalidateQueries({ queryKey: ["assignees", id] });
  };

  const patch = useMutation({
    mutationFn: (body: ComplaintPatch) =>
      apiFetch<ComplaintUpdateResult>(`/api/complaints/${encodeURIComponent(id)}`, { method: "PATCH", json: body }),
    onSuccess: (r, body) => {
      toast.success(body.status ? t("toast.status", { status: ts(r.status) }) : t("toast.saved"));
      // A dept admin who moved the ticket away no longer sees it.
      if (body.department_id && !isSuper) {
        router.push("/admin/queue");
        return;
      }
      refresh();
    },
    onError: (e) => {
      toast.error(errText(e));
      refresh();
    },
  });

  const link = useMutation({
    mutationFn: (body: { parent_id: string } | { unlink: true }) =>
      apiFetch<ComplaintUpdateResult>(`/api/complaints/${encodeURIComponent(id)}/link`, { method: "POST", json: body }),
    onSuccess: (_r, body) => {
      toast.success("unlink" in body ? t("toast.unlinked") : t("toast.linked"));
      refresh();
    },
    onError: (e) => toast.error(errText(e)),
  });

  const [rejectOpen, setRejectOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState<string | null>(null);
  const [resolveOpen, setResolveOpen] = useState(false);
  const [note, setNote] = useState("");

  if (query.isError && isApiError(query.error, "NOT_FOUND")) {
    return <EmptyState className="mx-auto mt-8 max-w-xl" title={tt("notFound.title")} body={tt("notFound.body")} />;
  }

  const n = (v: number) => toLocaleDigits(v, locale);
  const busy = patch.isPending || link.isPending;
  // Status buttons come only from allowed_next (= status_transitions, PRD 8.2). Duplicate is the Link action.
  const actions = d.allowed_next.filter((s) => s !== "duplicate");
  const assignee = d.admin?.assignee ?? null;
  // Sensitive reports can only go to department admins (DB trigger); don't offer field staff for them.
  const sensitive = Boolean(d.admin?.is_sensitive);
  const staffOptions = (staff.data ?? []).filter((m) => !sensitive || m.role === "dept_admin").map((m) => ({
    value: m.id,
    label: `${m.full_name || t("noName")}${m.role === "dept_admin" ? ` · ${t("roleAdmin")}` : ""}`,
  }));
  if (assignee && !staffOptions.some((o) => o.value === assignee.id)) {
    staffOptions.unshift({ value: assignee.id, label: assignee.name || t("noName") });
  }
  const assignLocked = d.status === "in_progress" || !isOpen(d.status) || d.status === "duplicate";
  const deptLocked = Boolean(assignee) || d.status === "assigned" || d.status === "in_progress" || !isOpen(d.status);

  const onStatus = (to: Status) => {
    if (to === "rejected") {
      setReason("");
      setReasonError(null);
      setRejectOpen(true);
    } else if (to === "resolved") {
      setResolveOpen(true);
    } else {
      patch.mutate({ status: to });
    }
  };

  const eventTitle = (e: TimelineEvent) => {
    if (e.type === "status") return e.to_status ? tt("event.status", { status: ts(e.to_status) }) : tt("event.statusChanged");
    return tt(`event.${KNOWN_EVENTS.includes(e.type) ? e.type : "other"}`);
  };
  const timeline: TimelineItem[] = d.events.map((e, i) => ({
    id: e.id,
    type: e.type,
    title: eventTitle(e),
    at: e.created_at,
    actor: e.actor_name || tt(`actor.${e.actor}`),
    body: e.note_en || e.note_as ? <LangText en={e.note_en} as={e.note_as} /> : undefined,
    highlight: i === d.events.length - 1,
  }));

  return (
    <div className="mx-auto max-w-[84rem] space-y-5">
      <nav aria-label={tt("breadcrumb")} className="text-sm">
        <Link href="/admin/queue" className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground">
          <ChevronLeft className="size-4" strokeWidth={1.75} aria-hidden />
          {t("back")}
        </Link>
      </nav>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_23rem] lg:items-start">
        {/* Left: the ticket */}
        <div className="min-w-0 space-y-5">
          <Card>
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-sm font-semibold tracking-wider">{d.code}</span>
              <StatusChip status={d.status} size="md" />
              <PriorityChip priority={d.priority} size="md" showCode />
              <CategoryChip category={d.category} size="md" />
              {d.is_urgent && <Chip tone="danger" size="md" icon={Siren}>{t("urgent")}</Chip>}
              {d.admin?.is_sensitive && <Chip tone="danger" size="md" icon={ShieldAlert}>{t("sensitive")}</Chip>}
              {d.visibility === "private" && <Chip tone="muted" size="md" icon={Lock}>{tt("private")}</Chip>}
            </div>
            <LifecycleTrack status={d.status} size="lg" className="mt-4" />
            <LangText tag="h1" en={d.title_en} as={d.title_as} fallback={d.code} className="text-title mt-3 text-xl sm:text-2xl" />
            <dl className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted-foreground">
              <div className="flex min-w-0 items-center gap-1.5">
                <dt className="sr-only">{tt("location")}</dt>
                <MapPin className="size-4 shrink-0" strokeWidth={1.75} aria-hidden />
                <dd className="min-w-0">
                  {d.location ? <LangText en={d.location.name_en} as={d.location.name_as} /> : tt("noLocation")}
                  {d.location_note && <span> · {d.location_note}</span>}
                </dd>
              </div>
              <div className="flex items-center gap-1.5">
                <dt className="sr-only">{tt("department")}</dt>
                <Building2 className="size-4 shrink-0" strokeWidth={1.75} aria-hidden />
                <dd>{d.department ? <LangText en={d.department.name_en} as={d.department.name_as} /> : tt("departmentPending")}</dd>
              </div>
              <div className="flex items-center gap-1.5">
                <dt className="sr-only">{t("reporter")}</dt>
                <UserRound className="size-4 shrink-0" strokeWidth={1.75} aria-hidden />
                <dd>{d.reporter?.anonymous ? <span className="italic">{t("anonymous")}</span> : (d.reporter?.name ?? "—")}</dd>
              </div>
              <div className="flex items-center gap-1.5">
                <dt className="sr-only">{tt("created")}</dt>
                <CalendarClock className="size-4 shrink-0" strokeWidth={1.75} aria-hidden />
                <dd>{tt("reported")} <RelativeTime date={d.created_at} /></dd>
              </div>
            </dl>
            <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
              <SlaCountdown due={d.sla_due_at} status={d.status} className="text-sm" />
              {d.metoo_count > 0 && <span className="text-muted-foreground">{tt("metoo.count", { count: d.metoo_count, n: n(d.metoo_count) })}</span>}
              {d.visibility === "public" && (
                <Link href={`/c/${d.id}`} className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground">
                  <ExternalLink className="size-3.5" strokeWidth={1.75} aria-hidden />
                  {t("reporterView")}
                </Link>
              )}
            </div>
          </Card>

          <EvidenceGallery photos={d.photos} videos={d.videos} />
          <SummaryCard d={d} />
          <AiCard d={d} />
          <CivicShieldCard data={d.ai?.civicshield} hasPhotos={d.photos.length > 0} />

          {d.resolution && (
            <Card>
              <CardHeader icon={<Wrench className="size-4 text-success" strokeWidth={1.75} aria-hidden />} title={tt("resolution.title")} className="mb-3" />
              <LangText tag="p" en={d.resolution.note_en} as={d.resolution.note_as} fallback={tt("resolution.noNote")} className="text-sm" />
              {d.resolution.photo_url && (
                <EvidenceGallery photos={[d.resolution.photo_url]} />
              )}
              {d.rating != null && <p className="mt-3 text-sm text-muted-foreground">{t("rating", { n: n(d.rating) })}</p>}
            </Card>
          )}

          <NotesCard id={id} />

          <TicketChat complaintId={d.id} />

          <Card>
            <CardHeader title={tt("timeline")} className="mb-4" />
            <Timeline items={timeline} />
          </Card>
        </div>

        {/* Right rail: actions, then the AI assists (reply draft in the reporter's language, before/after photo check). */}
        <aside aria-label={t("actions")} className="min-w-0 space-y-5 lg:sticky lg:top-4">
          <Card>
            <CardHeader title={t("actions")} description={actions.length ? t("actionsBody") : t("noActions")} className="mb-4" />
            {actions.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {actions.map((to) => (
                  <Button
                    key={to}
                    variant={to === "rejected" ? "secondary" : actions.length === 1 || to === "assigned" || to === "triaged" || to === "resolved" || to === "in_progress" ? "primary" : "secondary"}
                    className={cn(to === "rejected" && "text-danger")}
                    onClick={() => onStatus(to)}
                    disabled={busy || (to === "assigned" && !assignee)}
                    title={to === "assigned" && !assignee ? t("pickAssigneeFirst") : undefined}
                  >
                    {t(`to.${to}`)}
                  </Button>
                ))}
              </div>
            )}
          </Card>

          <Card>
            <CardHeader title={t("assignment")} className="mb-4" />
            <div className="space-y-4">
              <Select
                id="ws-department"
                label={t("department")}
                value={departmentId ?? ""}
                placeholder={departmentId ? undefined : t("noDepartment")}
                disabled={busy || deptLocked}
                hint={deptLocked && isOpen(d.status) ? t("departmentLocked") : undefined}
                onChange={(e) => e.target.value && patch.mutate({ department_id: e.target.value })}
                options={departments.map((x) => ({ value: x.id, label: locale === "as" ? x.name_as : x.name_en }))}
              />
              <Select
                id="ws-assignee"
                label={t("assignee")}
                value={assignee?.id ?? ""}
                placeholder={t("unassigned")}
                disabled={busy || assignLocked || !departmentId || staff.isPending}
                hint={
                  staff.isError ? t("staffError")
                  : d.status === "in_progress" ? t("assigneeLocked")
                  : sensitive ? (staffOptions.length === 0 ? t("noAdminsSensitive") : t("sensitiveAdminsOnly"))
                  : staff.data && staff.data.length === 0 ? t("noStaff")
                  : undefined
                }
                onChange={(e) => patch.mutate({ assignee_id: e.target.value || null })}
                options={staffOptions}
              />
              {!assignee && <ProposalCard d={d} busy={busy} onDone={refresh} />}
              <AssigneeSuggestions
                d={d}
                enabled={Boolean(departmentId) && !assignLocked && !sensitive}
                busy={busy}
                onAssign={(assignee_id) => patch.mutate({ assignee_id })}
              />
              {isOpen(d.status) && <TeamCard d={d} staff={staff.data ?? []} busy={busy} onDone={refresh} />}
            </div>
          </Card>

          <Card>
            <CardHeader title={t("triage")} className="mb-4" />
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <Select
                  id="ws-priority"
                  label={t("priority")}
                  value={String(d.priority)}
                  disabled={busy || !isOpen(d.status)}
                  onChange={(e) => patch.mutate({ priority: Number(e.target.value) })}
                  options={[1, 2, 3, 4].map((p) => ({ value: String(p), label: `P${n(p)} · ${tp(String(p))}` }))}
                />
                <Select
                  id="ws-category"
                  label={t("category")}
                  value={d.category}
                  disabled={busy || !isOpen(d.status)}
                  onChange={(e) => patch.mutate({ category: e.target.value as ComplaintDetail["category"] })}
                  options={CATEGORIES.map((c) => ({ value: c, label: tc(c) }))}
                />
              </div>
              <Switch
                id="ws-urgent"
                checked={d.is_urgent}
                disabled={busy}
                onCheckedChange={(v) => patch.mutate({ is_urgent: v })}
                label={t("urgent")}
                description={t("urgentHint")}
              />
              <Switch
                id="ws-sensitive"
                checked={Boolean(d.admin?.is_sensitive)}
                disabled={busy}
                onCheckedChange={(v) => patch.mutate({ is_sensitive: v })}
                label={t("sensitive")}
                description={t("sensitiveHint")}
              />
            </div>
          </Card>

          <SimilarCard d={d} busy={link.isPending} onLink={(parent_id) => link.mutate({ parent_id })} onUnlink={() => link.mutate({ unlink: true })} />

          <Card>
            <CardHeader title={t("update.title")} description={t("update.body")} className="mb-3" />
            <form
              className="space-y-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (!note.trim()) return;
                patch.mutate({ note: note.trim() }, { onSuccess: () => setNote("") });
              }}
            >
              <Textarea id="ws-update" label={t("update.label")} value={note} onChange={(e) => setNote(e.target.value)} rows={3} maxLength={1000} />
              <div className="flex justify-end">
                <Button type="submit" size="sm" loading={patch.isPending && patch.variables?.note !== undefined} disabled={!note.trim() || busy}>
                  <Send aria-hidden />
                  {t("update.send")}
                </Button>
              </div>
            </form>
          </Card>

          <ReplyDraftPanel complaintId={d.id} />
          <ResolutionCheckPanel complaintId={d.id} version={d.status} />
        </aside>
      </div>

      <Dialog
        open={rejectOpen}
        onOpenChange={setRejectOpen}
        title={t("reject.title")}
        description={t("reject.body")}
        footer={
          <>
            <Button variant="ghost" onClick={() => setRejectOpen(false)}>{t("reject.cancel")}</Button>
            <Button
              variant="danger"
              loading={patch.isPending}
              onClick={() => {
                if (reason.trim().length < 3) {
                  setReasonError(t("reject.required"));
                  return;
                }
                patch.mutate({ status: "rejected", reason: reason.trim() }, { onSuccess: () => setRejectOpen(false) });
              }}
            >
              {t("reject.confirm")}
            </Button>
          </>
        }
      >
        <Textarea
          id="ws-reject-reason"
          label={t("reject.label")}
          value={reason}
          onChange={(e) => {
            setReason(e.target.value);
            setReasonError(null);
          }}
          rows={3}
          maxLength={500}
          showCount
          error={reasonError ?? undefined}
        />
      </Dialog>

      <ResolveDrawer complaintId={id} code={d.code} open={resolveOpen} onOpenChange={setResolveOpen} requirePhoto={false} onDone={refresh} />
    </div>
  );
}
