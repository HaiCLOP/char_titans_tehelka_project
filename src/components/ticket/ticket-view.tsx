"use client";
import { useRef, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { useReducedMotion } from "framer-motion";
import { toast } from "sonner";
import {
  Building2, CalendarClock, ChevronLeft, ChevronRight, Languages, Lock, MapPin, RotateCcw, SearchX, ThumbsDown,
  ThumbsUp, Wrench,
} from "lucide-react";
import { OPEN_STATUSES, type ComplaintDetail, type Status, type SupportResult, type TimelineEvent, type VerifyRequest, type VerifyResult } from "@/lib/domain";
import { toLocaleDigits } from "@/lib/utils";
import {
  Button, Card, CardHeader, CategoryChip, Chip, Dialog, EmptyState, LangText, PriorityChip, RelativeTime, StatusChip,
  Textarea, buttonVariants, type TimelineItem,
} from "@/components/ui";
import { apiFetch, isApiError } from "@/components/api-client";
import { useRealtime } from "@/components/use-realtime";
import { TicketChat } from "@/components/chat/ticket-chat";
import { SlaCountdown } from "./sla-countdown";
import { EvidenceGallery } from "./evidence-gallery";
import { BeforeAfter, Confetti, LiveLifecycleTrack, LiveTimeline, MeTooButton, RatingSummary, StarRating, type MeTooState } from "./ticket-fx";

const KNOWN_EVENTS = ["created", "status", "assigned", "note", "metoo", "ai"];

export function PhotoCarousel({ photos }: { photos: string[] }) {
  const t = useTranslations("ticket");
  const locale = useLocale();
  const reduce = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  if (photos.length === 0) return null;
  const go = (i: number) => {
    const el = ref.current;
    if (!el) return;
    el.scrollTo({ left: i * el.clientWidth, behavior: reduce ? "auto" : "smooth" });
  };
  return (
    <div className="relative overflow-hidden rounded-card border border-border bg-surface-muted">
      <div
        ref={ref}
        onScroll={(e) => setIndex(Math.round(e.currentTarget.scrollLeft / Math.max(1, e.currentTarget.clientWidth)))}
        className="flex snap-x snap-mandatory overflow-x-auto [scrollbar-width:none]"
        aria-label={t("photos")}
        role="region"
        tabIndex={0}
      >
        {photos.map((src, i) => (
          // eslint-disable-next-line @next/next/no-img-element -- signed Supabase URLs expire; skip the optimiser
          <img
            key={src}
            src={src}
            alt={t("photoN", { n: toLocaleDigits(i + 1, locale), total: toLocaleDigits(photos.length, locale) })}
            className="aspect-[4/3] w-full shrink-0 snap-center object-cover sm:aspect-[16/9]"
            loading={i === 0 ? "eager" : "lazy"}
          />
        ))}
      </div>
      {photos.length > 1 && (
        <>
          <button
            type="button"
            onClick={() => go(Math.max(0, index - 1))}
            disabled={index === 0}
            aria-label={t("prevPhoto")}
            className="absolute top-1/2 left-2 grid size-9 -translate-y-1/2 place-items-center rounded-full bg-surface/90 shadow-sm disabled:opacity-0"
          >
            <ChevronLeft className="size-4" aria-hidden />
          </button>
          <button
            type="button"
            onClick={() => go(Math.min(photos.length - 1, index + 1))}
            disabled={index === photos.length - 1}
            aria-label={t("nextPhoto")}
            className="absolute top-1/2 right-2 grid size-9 -translate-y-1/2 place-items-center rounded-full bg-surface/90 shadow-sm disabled:opacity-0"
          >
            <ChevronRight className="size-4" aria-hidden />
          </button>
          <span className="absolute right-3 bottom-3 rounded-full bg-surface/90 px-2.5 py-0.5 text-xs font-medium shadow-sm">
            {toLocaleDigits(index + 1, locale)} / {toLocaleDigits(photos.length, locale)}
          </span>
        </>
      )}
    </div>
  );
}

type VerifyMode = "fixed" | "notFixed" | "reopen" | null;

export function TicketView({ initial }: { initial: ComplaintDetail }) {
  const t = useTranslations("ticket");
  const tf = useTranslations("ticketFx");
  const tu = useTranslations("ui");
  const ts = useTranslations("status");
  const locale = useLocale();
  const qc = useQueryClient();
  const id = initial.id;
  const key = ["complaint", id] as const;
  const live = initial.is_owner || initial.is_staff_view;

  const query = useQuery({
    queryKey: key,
    queryFn: ({ signal }) => apiFetch<ComplaintDetail>(`/api/complaints/${encodeURIComponent(id)}`, { signal }),
    initialData: initial,
    staleTime: 15_000,
    retry: (count, e) => !isApiError(e, "NOT_FOUND") && count < 2,
    // Realtime follows RLS: only the owner and staff get change events. Everyone else polls lightly.
    refetchOnWindowFocus: !live,
    refetchInterval: live ? false : 10_000,
  });

  useRealtime(
    `ticket-${id}`,
    [
      { table: "complaints", filter: `id=eq.${id}`, event: "UPDATE" },
      { table: "complaint_events", filter: `complaint_id=eq.${id}`, event: "INSERT" },
    ],
    () => void qc.invalidateQueries({ queryKey: key }),
    live,
  );

  const [showOriginal, setShowOriginal] = useState(false);
  const [mode, setMode] = useState<VerifyMode>(null);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [ratingError, setRatingError] = useState<string | null>(null);
  const [celebrate, setCelebrate] = useState(0);
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState<string | null>(null);

  // Optimistic "Me too": bump the count at once, roll back if the server says no.
  const support = useMutation({
    mutationFn: () => apiFetch<SupportResult>(`/api/complaints/${encodeURIComponent(id)}/support`, { method: "POST" }),
    onMutate: async () => {
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<ComplaintDetail>(key);
      qc.setQueryData<ComplaintDetail>(key, (d) =>
        d ? { ...d, metoo_count: d.metoo_count + 1, supported_by_me: true, can_support: false } : d,
      );
      return { prev };
    },
    onSuccess: (r) => {
      qc.setQueryData<ComplaintDetail>(key, (d) => (d ? { ...d, metoo_count: r.metoo_count, supported_by_me: true, can_support: false } : d));
      toast.success(t("metoo.done"));
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(key, ctx.prev);
      toast.error(t("metoo.failed"));
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: key }),
  });

  const verify = useMutation({
    mutationFn: (body: VerifyRequest) =>
      apiFetch<VerifyResult>(`/api/complaints/${encodeURIComponent(id)}/verify`, { method: "POST", json: body }),
    onSuccess: (_r, body) => {
      toast.success(body.fixed ? tf("celebrate") : t("verify.reopened"));
      if (body.fixed) setCelebrate((c) => c + 1);
      setMode(null);
      void qc.invalidateQueries({ queryKey: key });
      void qc.invalidateQueries({ queryKey: ["complaints", "mine"] });
    },
    onError: (e) => {
      toast.error(isApiError(e, "INVALID_TRANSITION") ? t("verify.changed") : t("verify.failed"));
      if (isApiError(e, "INVALID_TRANSITION")) {
        setMode(null);
        void qc.invalidateQueries({ queryKey: key });
      }
    },
  });

  const open = (m: VerifyMode) => {
    setMode(m);
    setRating(0);
    setComment("");
    setRatingError(null);
    setReason("");
    setReasonError(null);
  };
  const confirmVerify = () => {
    if (mode === "fixed") {
      if (!rating) {
        setRatingError(tf("ratingNeeded"));
        return;
      }
      verify.mutate({ fixed: true, rating, ...(comment.trim() ? { comment: comment.trim() } : {}) });
      return;
    }
    if (reason.trim().length < 3) {
      setReasonError(t("verify.reasonRequired"));
      return;
    }
    verify.mutate({ fixed: false, reason: reason.trim() });
  };

  if (query.isError && isApiError(query.error, "NOT_FOUND")) {
    return (
      <div className="mx-auto max-w-xl py-8">
        <EmptyState icon={SearchX} title={t("notFound.title")} body={t("notFound.body")} />
      </div>
    );
  }

  const d = query.data;
  const n = (v: number) => toLocaleDigits(v, locale);

  const eventTitle = (e: TimelineEvent) => {
    if (e.type === "status") return e.to_status ? t("event.status", { status: ts(e.to_status) }) : t("event.statusChanged");
    return t(`event.${KNOWN_EVENTS.includes(e.type) ? e.type : "other"}`);
  };
  const timeline: TimelineItem[] = d.events.map((e, i) => ({
    id: e.id,
    type: e.type,
    title: eventTitle(e),
    at: e.created_at,
    actor: e.actor_name || t(`actor.${e.actor}`),
    body: e.note_en || e.note_as ? <LangText en={e.note_en} as={e.note_as} /> : undefined,
    highlight: i === d.events.length - 1,
  }));

  const showResolution = (d.status === "resolved" || d.status === "closed") && d.resolution;
  const isOpen = (OPEN_STATUSES as readonly Status[]).includes(d.status);
  const metooState: MeTooState = d.can_support
    ? "can"
    : d.supported_by_me
      ? "supported"
      : d.is_owner
        ? d.visibility === "private"
          ? "private"
          : "own"
        : !isOpen
          ? "closed"
          : "view";
  const originalLang = d.original_lang ?? undefined;

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <nav aria-label={t("breadcrumb")} className="text-sm">
        <Link href="/my" className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground">
          <ChevronLeft className="size-4" aria-hidden />
          {t("back")}
        </Link>
      </nav>

      {/* Header */}
      <Card>
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-sm font-semibold tracking-wider">{d.code}</span>
          <StatusChip status={d.status} size="md" />
          <PriorityChip priority={d.priority} size="md" showCode />
          <CategoryChip category={d.category} size="md" />
          {d.visibility === "private" && (
            <Chip tone="muted" size="md" icon={Lock}>
              {t("private")}
            </Chip>
          )}
        </div>
        <LiveLifecycleTrack status={d.status} className="mt-4" />
        <LangText tag="h1" en={d.title_en} as={d.title_as} fallback={d.code} className="mt-3 text-xl font-bold tracking-tight sm:text-2xl" />
        <dl className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted-foreground">
          <div className="flex min-w-0 items-center gap-1.5">
            <dt className="sr-only">{t("location")}</dt>
            <MapPin className="size-4 shrink-0" aria-hidden />
            <dd className="min-w-0">
              {d.location ? <LangText en={d.location.name_en} as={d.location.name_as} /> : t("noLocation")}
              {d.location_note && <span> · {d.location_note}</span>}
            </dd>
          </div>
          <div className="flex items-center gap-1.5">
            <dt className="sr-only">{t("department")}</dt>
            <Building2 className="size-4 shrink-0" aria-hidden />
            <dd>{d.department ? <LangText en={d.department.name_en} as={d.department.name_as} /> : t("departmentPending")}</dd>
          </div>
          <div className="flex items-center gap-1.5">
            <dt className="sr-only">{t("created")}</dt>
            <CalendarClock className="size-4 shrink-0" aria-hidden />
            <dd>
              {t("reported")} <RelativeTime date={d.created_at} />
            </dd>
          </div>
        </dl>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <SlaCountdown due={d.sla_due_at} status={d.status} className="text-sm" />
          {(metooState !== "view" || d.metoo_count > 0) && (
            <MeTooButton state={metooState} count={d.metoo_count} pending={support.isPending} onPress={() => support.mutate()} />
          )}
        </div>
      </Card>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
        <div className="min-w-0 space-y-5">
          <EvidenceGallery photos={d.photos} videos={d.videos} />

          <Card>
            <CardHeader
              title={t("summary")}
              className="mb-2"
              action={
                d.original_text ? (
                  <Button size="sm" variant="ghost" onClick={() => setShowOriginal((v) => !v)} aria-pressed={showOriginal}>
                    <Languages aria-hidden />
                    {showOriginal ? t("showTranslated") : t("showOriginal")}
                  </Button>
                ) : undefined
              }
            />
            {showOriginal && d.original_text ? (
              <div>
                <p className="mb-1 text-xs font-medium text-muted-foreground">{t("originalLabel")}</p>
                <p lang={originalLang} className="whitespace-pre-wrap text-sm">
                  {d.original_text}
                </p>
              </div>
            ) : (
              <LangText tag="p" en={d.summary_en} as={d.summary_as} fallback={<span className="text-muted-foreground">{t("noSummary")}</span>} className="text-sm" />
            )}
          </Card>

          {showResolution && d.resolution && (
            <Card className="border-p4/40">
              <CardHeader icon={<Wrench className="size-4 text-p4" aria-hidden />} title={t("resolution.title")} className="mb-3" />
              <LangText tag="p" en={d.resolution.note_en} as={d.resolution.note_as} fallback={t("resolution.noNote")} className="text-sm" />
              {(d.photos[0] || d.resolution.photo_url) && (
                <div className="mt-4">
                  <p className="mb-2 text-sm font-medium">{tf("beforeAfter")}</p>
                  <BeforeAfter before={d.photos[0] ?? null} after={d.resolution.photo_url} />
                </div>
              )}
              {d.status === "closed" && d.rating && (
                <RatingSummary
                  rating={d.rating}
                  comment={d.rating_comment}
                  title={d.is_owner ? tf("yourFeedback") : tf("reporterFeedback")}
                  className="mt-4"
                />
              )}
            </Card>
          )}

          {d.can_verify && (
            <Card>
              <CardHeader title={t("verify.title")} description={t("verify.body")} className="mb-4" />
              <div className="grid gap-2 sm:grid-cols-2">
                <Button size="lg" onClick={() => open("fixed")}>
                  <ThumbsUp aria-hidden />
                  {t("verify.fixed")}
                </Button>
                <Button size="lg" variant="secondary" onClick={() => open("notFixed")}>
                  <ThumbsDown aria-hidden />
                  {t("verify.notFixed")}
                </Button>
              </div>
            </Card>
          )}

          {d.can_reopen && (
            <Card className="flex flex-wrap items-center gap-3">
              <p className="min-w-0 flex-1 text-sm text-muted-foreground">{t("verify.reopenBody", { n: n(7) })}</p>
              <Button variant="secondary" onClick={() => open("reopen")}>
                <RotateCcw aria-hidden />
                {t("verify.reopen")}
              </Button>
            </Card>
          )}

          {/* S08 chat: the reporter and staff of this ticket (RLS hides it from everyone else). */}
          {live && <TicketChat complaintId={d.id} />}
        </div>

        <Card className="min-w-0">
          <CardHeader
            title={t("timeline")}
            className="mb-4"
            action={
              live ? (
                <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span className="relative flex size-2" aria-hidden>
                    <span className="absolute inline-flex size-full animate-ping rounded-full bg-success opacity-60 motion-reduce:animate-none" />
                    <span className="relative inline-flex size-2 rounded-full bg-success" />
                  </span>
                  {tf("live")}
                </span>
              ) : undefined
            }
          />
          <LiveTimeline items={timeline} emptyText={tu("timelineEmpty")} />
        </Card>
      </div>

      <Dialog
        open={mode !== null}
        onOpenChange={(o) => !o && setMode(null)}
        title={mode === "fixed" ? t("verify.fixedTitle") : mode === "reopen" ? t("verify.reopenTitle") : t("verify.notFixedTitle")}
        description={mode === "fixed" ? t("verify.ratingHint") : t("verify.reasonHint")}
        footer={
          <>
            <Button variant="ghost" onClick={() => setMode(null)}>
              {t("verify.cancel")}
            </Button>
            <Button onClick={confirmVerify} loading={verify.isPending}>
              {mode === "fixed" ? t("verify.confirm") : t("verify.send")}
            </Button>
          </>
        }
      >
        {mode === "fixed" ? (
          <div className="space-y-3">
            <StarRating
              value={rating}
              onChange={(v) => {
                setRating(v);
                setRatingError(null);
              }}
              label={t("verify.ratingLabel")}
            />
            {ratingError && (
              <p role="alert" className="text-center text-sm text-danger">
                {ratingError}
              </p>
            )}
            <Textarea
              id="verify-comment"
              label={tf("commentLabel")}
              placeholder={tf("commentPlaceholder")}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              maxLength={280}
              showCount
              rows={3}
              className="min-h-20"
            />
          </div>
        ) : (
          <Textarea
            id="verify-reason"
            label={t("verify.reasonLabel")}
            value={reason}
            onChange={(e) => {
              setReason(e.target.value);
              setReasonError(null);
            }}
            maxLength={500}
            showCount
            rows={4}
            error={reasonError ?? undefined}
          />
        )}
      </Dialog>

      <Confetti fire={celebrate} />

      <p className="text-center text-xs text-muted-foreground">
        <Link href="/report" className={buttonVariants({ variant: "ghost", size: "sm" })}>
          {t("reportAnother")}
        </Link>
      </p>
    </div>
  );
}
