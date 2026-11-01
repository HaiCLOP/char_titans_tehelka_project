"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { AlertTriangle, ChevronDown, ClipboardList, EyeOff, Globe2, ImagePlus, Loader2, Lock, MapPin, Mic, Pencil, Square, RotateCcw, RotateCw, Send, ShieldAlert, X } from "lucide-react";
import {
  CATEGORIES,
  COMPLAINTS_PER_HOUR,
  MAX_PHOTOS,
  type Category,
  type Intake,
  type LocationItem,
  type SimilarItem,
  type SubmitComplaintInput,
  type SubmitResult,
  type SupportResult,
  type UploadResult,
  type Visibility,
} from "@/lib/domain";
import type { ReportAgentResult, ReportDraft } from "@/lib/report-agent";
import { compressImage } from "@/lib/image";
import { pickLang } from "@/lib/lang";
import { cn, toLocaleDigits } from "@/lib/utils";
import { Button, Card, CategoryChip, Chip, Combobox, Drawer, Input, LangText, PriorityChip, Select, StatusChip, Textarea } from "@/components/ui";
import { ApiError, apiFetch, isApiError } from "@/components/api-client";
import { Civi, type CiviPose } from "@/components/mascot/civi";
import { EmergencyBanner } from "./emergency-banner";
import { useRecorder } from "@/components/voice/use-voice";
import { toast } from "sonner";

/** Same limits as POST /api/report-agent (src/lib/report-agent.ts). */
const MAX_TURNS = 12;
const MAX_TURN_CHARS = 1000;

type ChatMsg = { id: string; role: "user" | "assistant"; content: string };
type Photo = { id: string; blob: Blob; url: string; status: "uploading" | "done" | "error"; path?: string };
type EditableDraft = ReportDraft & { requestId: string };
/** Who can see the report, asked as one tap in the chat instead of a privacy form. */
type Privacy = "public" | "public_anon" | "private" | "sensitive";
const PRIVACY: { id: Privacy; icon: typeof Globe2 }[] = [
  { id: "public", icon: Globe2 },
  { id: "public_anon", icon: EyeOff },
  { id: "private", icon: Lock },
  { id: "sensitive", icon: ShieldAlert },
];

const uid = () => crypto.randomUUID();
const fileName = (blob: Blob) => `photo.${blob.type === "image/webp" ? "webp" : blob.type === "image/png" ? "png" : "jpg"}`;

/**
 * "Tell Civi what happened": a short chat that ends in a report draft. Civi asks at most two questions
 * (server-enforced), then the student checks the draft and submits it through the normal pipeline.
 * Nothing is ever submitted without the student tapping Submit (PRD rule 1).
 */
export function ChatReport() {
  const t = useTranslations("reportChat");
  const tr = useTranslations("report");
  const tc = useTranslations("category");
  const tp = useTranslations("priority");
  const locale = useLocale();
  const router = useRouter();
  const n = (v: number) => toLocaleDigits(v, locale);

  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [draft, setDraft] = useState<EditableDraft | null>(null);
  const [aiOffline, setAiOffline] = useState(false);
  const [suggested, setSuggested] = useState<LocationItem[]>([]);
  const [location, setLocation] = useState<LocationItem | null>(null);
  const [privacy, setPrivacy] = useState<Privacy | null>(null);
  const [editing, setEditing] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  const [similar, setSimilar] = useState<SimilarItem[]>([]);
  const [dupOpen, setDupOpen] = useState(false);
  const dupChecked = useRef<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [done, setDone] = useState(false);

  const tv = useTranslations("voiceEngine");
  // Speak instead of typing: the engine transcribes (Assamese too) into the box, the student checks and sends.
  const recorder = useRecorder(locale === "as" ? "as" : "en", (text) =>
    setInput((cur) => (cur.trim() ? `${cur.trim()} ${text}` : text).slice(0, MAX_TURN_CHARS)),
  );
  const fileRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const draftRef = useRef<HTMLDivElement>(null);

  // ---------- photos (same compression + upload as the report form) ----------
  const upload = useCallback((p: Photo) => {
    setPhotos((cur) => cur.map((x) => (x.id === p.id ? { ...x, status: "uploading" } : x)));
    const form = new FormData();
    form.append("file", p.blob, fileName(p.blob));
    apiFetch<UploadResult>("/api/upload", { method: "POST", body: form })
      .then((r) => setPhotos((cur) => cur.map((x) => (x.id === p.id ? { ...x, status: "done", path: r.path } : x))))
      .catch(() => setPhotos((cur) => cur.map((x) => (x.id === p.id ? { ...x, status: "error" } : x))));
  }, []);

  const addFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    const room = MAX_PHOTOS - photos.length;
    if (files.length > room) toast.info(t("photosMax", { n: n(MAX_PHOTOS) }));
    for (const file of Array.from(files).slice(0, Math.max(0, room))) {
      try {
        const blob = await compressImage(file);
        const p: Photo = { id: uid(), blob, url: URL.createObjectURL(blob), status: "uploading" };
        setPhotos((cur) => [...cur, p]);
        upload(p);
      } catch {
        toast.error(t("photoCompressFailed"));
      }
    }
  };

  const removePhoto = (id: string) =>
    setPhotos((cur) => {
      const gone = cur.find((p) => p.id === id);
      if (gone) URL.revokeObjectURL(gone.url);
      return cur.filter((p) => p.id !== id);
    });

  const photoPaths = photos.flatMap((p) => (p.status === "done" && p.path ? [p.path] : []));
  const uploading = photos.some((p) => p.status === "uploading");
  const uploadFailed = photos.some((p) => p.status === "error");

  // ---------- chat turns ----------
  const turn = useMutation({
    mutationFn: (history: ChatMsg[]) =>
      apiFetch<ReportAgentResult>("/api/report-agent", {
        method: "POST",
        json: {
          messages: history.map(({ role, content }) => ({ role, content })),
          photo_paths: photoPaths,
          location_id: location?.id ?? null,
          locale,
        },
      }),
    onSuccess: (r) => {
      const content = r.reply || t(`fallback.${r.need ?? "draft"}`);
      setMessages((cur) => [...cur, { id: uid(), role: "assistant", content }]);
      setAiOffline(r.source === "fallback" && Boolean(r.draft));
      if (r.draft) {
        setDraft({ ...r.draft, requestId: uid() }); // one idempotency key per draft
        setSuggested(r.locations);
        // Civi already knows the place (named, chosen, or the student's own hostel): fill it in.
        const picked = r.locations.find((l) => l.id === r.picked_location_id);
        if (picked) setLocation(picked);
        setShowErrors(false);
        setEditing(false);
      }
    },
  });

  const sent = messages.length;
  const chatFull = sent + 1 > MAX_TURNS;
  const canSend = !turn.isPending && !chatFull && !done && (input.trim().length > 0 || photoPaths.length > 0) && !uploading;

  const send = (text = input) => {
    const content = text.trim().slice(0, MAX_TURN_CHARS);
    if (turn.isPending || chatFull || done || (!content && photoPaths.length === 0) || uploading) return;
    const next = [...messages, { id: uid(), role: "user" as const, content }];
    setMessages(next);
    setInput("");
    turn.mutate(next);
  };

  const retryTurn = () => {
    if (messages.at(-1)?.role === "user") turn.mutate(messages);
  };

  const restart = () => {
    turn.reset();
    setMessages([]);
    setDraft(null);
    setSuggested([]);
    setLocation(null);
    setAiOffline(false);
    setSimilar([]);
    dupChecked.current = null;
    setPrivacy(null);
    setEditing(false);
  };

  // Keep the newest message (or the fresh draft) in view above the pinned composer.
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [messages.length, turn.isPending, turn.isError]);
  const draftId = draft?.requestId;
  useEffect(() => {
    if (draftId) draftRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
  }, [draftId]);
  useEffect(() => {
    if (privacy) endRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [privacy]);

  // ---------- submit ----------
  const titleField = locale === "as" ? "title_as" : "title_en";
  const titleError = draft && draft[titleField].trim().length < 3 ? t("draft.needTitle") : null;
  const textError = draft && !draft.text.trim() && photoPaths.length === 0 ? t("draft.needText") : null;
  const isUrgent = Boolean(draft?.is_urgent || turn.data?.is_urgent);
  const sensitive = privacy === "sensitive";
  const anonymous = privacy === "public_anon";
  const effectiveVisibility: Visibility = privacy === "public" || privacy === "public_anon" ? "public" : "private";

  const submit = useMutation({
    mutationFn: (body: SubmitComplaintInput) => apiFetch<SubmitResult>("/api/complaints", { method: "POST", json: body }),
    onSuccess: (r) => {
      setDone(true);
      toast.success(t("submitted"));
      router.push(`/report/done?id=${encodeURIComponent(r.id)}`);
    },
  });

  const doSubmit = () => {
    if (!draft) return;
    setDupOpen(false);
    const intake: Intake = {
      title_en: draft.title_en.trim(),
      title_as: draft.title_as.trim(),
      summary_en: draft.summary_en,
      summary_as: draft.summary_as,
      category: draft.category,
      categories: [draft.category],
      priority: draft.priority,
      priority_reason_en: "",
      location_hint: draft.location_query?.slice(0, 80) ?? null,
      is_abusive: false,
      abusive_reason_en: null,
      abusive_reason_as: null,
      has_personal_data: false,
      is_urgent: draft.is_urgent,
      is_sensitive_suggested: draft.is_sensitive_suggested,
      confidence: 0.8,
      is_relevant: true,
      rejection_reason_en: null,
      rejection_reason_as: null,
      has_abusive_image: false,
      has_explicit_image: false,
      has_ai_image: false,
      image_rejection_reason_en: null,
      image_rejection_reason_as: null,
    };
    // The server recomputes every safety field; only title, category and priority edits are taken from here.
    submit.mutate({
      client_request_id: draft.requestId,
      text: draft.text.trim(),
      image_paths: photoPaths,
      location_id: location?.id ?? null,
      location_note: draft.location_note?.trim() || null,
      visibility: effectiveVisibility,
      anonymous,
      is_sensitive: sensitive,
      intake,
    });
  };

  const onSubmit = async () => {
    setShowErrors(true);
    if (!draft || !privacy || titleError || textError || uploading || uploadFailed || submit.isPending || checking) return;
    if (titleError || textError) setEditing(true);
    const key = `${draft.requestId}|${location?.id ?? ""}`;
    if (dupChecked.current !== key) {
      dupChecked.current = key;
      setChecking(true);
      let items: SimilarItem[] = [];
      try {
        items = (await apiFetch<SimilarItem[]>("/api/complaints/similar", {
          method: "POST",
          json: { summary_en: draft.summary_en, location_id: location?.id ?? null },
        })).slice(0, 3);
      } catch {
        items = []; // duplicate search down ⇒ no duplicate step (same as the form)
      }
      setChecking(false);
      setSimilar(items);
      if (items.length > 0) {
        setDupOpen(true);
        return;
      }
    }
    doSubmit();
  };

  const support = useMutation({
    mutationFn: (id: string) => apiFetch<SupportResult>(`/api/complaints/${encodeURIComponent(id)}/support`, { method: "POST" }),
    onSuccess: (_r, id) => {
      toast.success(tr("dup.supported"));
      setDupOpen(false);
      router.push(`/c/${encodeURIComponent(id)}`);
    },
    onError: (e) => toast.error(isApiError(e, "VALIDATION_ERROR") ? tr("dup.ownReport") : tr("dup.supportFailed")),
  });

  const loadLocations = useCallback(
    (q: string, signal: AbortSignal) => apiFetch<LocationItem[]>(`/api/locations?q=${encodeURIComponent(q)}`, { signal }),
    [],
  );

  const patch = (p: Partial<ReportDraft>) => setDraft((d) => (d ? { ...d, ...p } : d));

  const pose: CiviPose = done
    ? "celebrating"
    : turn.isPending || checking
      ? "thinking"
      : isUrgent
        ? "concerned"
        : draft
          ? "helping"
          : "hero";

  const turnErrorText = isApiError(turn.error, "RATE_LIMITED")
    ? t("errors.rateLimited")
    : turn.error instanceof ApiError && turn.error.code === "NETWORK"
      ? t("errors.network")
      : t("errors.turnFailed");
  const submitErrorText = isApiError(submit.error, "RATE_LIMITED")
    ? tr("errors.rateLimited", { n: n(COMPLAINTS_PER_HOUR) })
    : isApiError(submit.error, "VALIDATION_ERROR")
      ? tr("rejection.cannotSubmit")
      : submit.error instanceof ApiError && submit.error.code === "NETWORK"
        ? tr("errors.network")
        : tr("errors.submitFailed");

  const examples = [t("example1"), t("example2"), t("example3")];

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col">
      {/* Header: Civi changes pose with the step */}
      <header className="flex items-center gap-3">
        <Civi pose={pose} size="md" interactive={false} />
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-bold tracking-tight sm:text-2xl">{t("title")}</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">{t("subtitle")}</p>
        </div>
      </header>
      <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
        {messages.length > 0 && !done && (
          <Button variant="ghost" size="sm" onClick={restart}>
            <RotateCcw aria-hidden strokeWidth={1.75} />
            {t("restart")}
          </Button>
        )}
        <Link
          href="/report"
          className="inline-flex h-10 items-center gap-1.5 rounded-full px-3 text-sm font-medium text-muted-foreground hover:bg-surface-muted hover:text-foreground"
        >
          <ClipboardList className="size-4" strokeWidth={1.75} aria-hidden />
          {t("useForm")}
        </Link>
      </div>

      {/* Conversation */}
      <ol className="mt-3 space-y-3" aria-live="polite">
        <Bubble role="assistant" label={t("civi")}>
          {t("greeting")}
        </Bubble>
        {messages.map((m) => (
          <Bubble key={m.id} role={m.role} label={m.role === "user" ? t("you") : t("civi")}>
            {m.content || <ImagePlus className="size-4" strokeWidth={1.75} aria-label={t("attach")} />}
          </Bubble>
        ))}
        {turn.isPending && (
          <li className="flex" role="status">
            <span className="inline-flex items-center gap-2 rounded-2xl rounded-bl-md border border-border bg-surface px-4 py-2.5 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" strokeWidth={1.75} aria-hidden />
              {t("thinking")}
            </span>
          </li>
        )}
        {turn.isError && (
          <li role="alert" className="flex flex-wrap items-center gap-3 rounded-card border border-danger-border bg-danger-soft p-3 text-sm">
            <AlertTriangle className="size-4 shrink-0 text-danger" strokeWidth={1.75} aria-hidden />
            <span className="min-w-0 flex-1">{turnErrorText}</span>
            <Button size="sm" variant="secondary" onClick={retryTurn}>
              <RotateCw aria-hidden strokeWidth={1.75} />
              {t("errors.retry")}
            </Button>
          </li>
        )}
      </ol>

      {/* Empty state: one tap starts the conversation */}
      {messages.length === 0 && (
        <div className="mt-4">
          <p className="text-xs font-medium text-muted-foreground">{t("examplesLabel")}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {examples.map((ex) => (
              <button
                key={ex}
                type="button"
                onClick={() => send(ex)}
                className="min-h-10 rounded-full border border-border bg-surface px-4 py-2 text-left text-sm text-foreground hover:border-border-strong hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {ex}
              </button>
            ))}
          </div>
        </div>
      )}

      {isUrgent && <EmergencyBanner className="mt-4" compact />}

      {/* Draft: a short summary Civi filled in, editable on request, then one privacy question */}
      {draft && (
        <div ref={draftRef} className="mt-4 scroll-mt-4 space-y-3">
          <Card className="space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-medium text-muted-foreground">{t("summary.title")}</p>
                <h2 className="mt-1 text-base font-bold tracking-tight break-words">{draft[titleField] || t("draft.needTitle")}</h2>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setEditing((v) => !v)} aria-expanded={editing}>
                {editing ? <ChevronDown aria-hidden strokeWidth={1.75} className="rotate-180" /> : <Pencil aria-hidden strokeWidth={1.75} />}
                {editing ? t("summary.doneEditing") : t("summary.edit")}
              </Button>
            </div>
            <p className="text-sm leading-relaxed text-muted-foreground line-clamp-4 whitespace-pre-wrap">{draft.text}</p>
            <div className="flex flex-wrap items-center gap-2">
              <CategoryChip category={draft.category} />
              <PriorityChip priority={draft.priority} />
              {location ? (
                <Chip tone="neutral" icon={MapPin}>{pickLang(location, "name", locale)}</Chip>
              ) : (
                <button
                  type="button"
                  onClick={() => setEditing(true)}
                  className="inline-flex min-h-10 items-center gap-1.5 rounded-full border border-dashed border-border-strong px-3 text-sm text-muted-foreground hover:text-foreground"
                >
                  <MapPin className="size-4" strokeWidth={1.75} aria-hidden />
                  {t("summary.addPlace")}
                </button>
              )}
              {draft.location_note && <span className="text-xs text-muted-foreground">{draft.location_note}</span>}
            </div>
            {aiOffline && (
              <p role="status" className="rounded-field bg-surface-muted px-3 py-2 text-xs text-foreground">
                {t("aiOffline")}
              </p>
            )}

            {editing && (
              <div className="space-y-4 border-t border-border pt-4">
                <Input
                  id="chat-title"
                  label={t("draft.titleLabel")}
                  value={draft[titleField]}
                  maxLength={locale === "as" ? 120 : 90}
                  onChange={(e) => patch({ [titleField]: e.target.value })}
                  error={showErrors ? titleError ?? undefined : undefined}
                />
                <Textarea
                  id="chat-text"
                  label={t("draft.text")}
                  value={draft.text}
                  rows={3}
                  maxLength={2000}
                  onChange={(e) => patch({ text: e.target.value })}
                  error={showErrors ? textError ?? undefined : undefined}
                />
                <div className="grid grid-cols-2 gap-3">
                  <Select
                    id="chat-category"
                    label={t("draft.category")}
                    value={draft.category}
                    onChange={(e) => patch({ category: e.target.value as Category })}
                    options={CATEGORIES.map((c) => ({ value: c, label: tc(c) }))}
                  />
                  <Select
                    id="chat-priority"
                    label={t("draft.priority")}
                    value={String(draft.priority)}
                    onChange={(e) => patch({ priority: Number(e.target.value) })}
                    options={[1, 2, 3, 4].map((p) => ({ value: String(p), label: tp(String(p)) }))}
                  />
                </div>
                {suggested.length > 1 && (
                  <div>
                    <p className="text-sm font-medium">{t("draft.suggested")}</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {suggested.map((l) => {
                        const on = location?.id === l.id;
                        return (
                          <button
                            key={l.id}
                            type="button"
                            aria-pressed={on}
                            onClick={() => setLocation(on ? null : l)}
                            className={cn(
                              "inline-flex min-h-10 max-w-full items-center gap-1.5 rounded-full border px-3 py-1.5 text-left text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                              on ? "border-foreground bg-surface text-foreground ring-1 ring-foreground" : "border-border bg-surface text-muted-foreground hover:text-foreground",
                            )}
                          >
                            <MapPin className="size-4 shrink-0" strokeWidth={1.75} aria-hidden />
                            <span className="min-w-0 break-words">{pickLang(l, "name", locale)}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
                <Combobox<LocationItem>
                  id="chat-location"
                  label={t("draft.location")}
                  placeholder={t("draft.locationPlaceholder")}
                  value={location}
                  onChange={setLocation}
                  loadOptions={loadLocations}
                  getKey={(l) => l.id}
                  getLabel={(l) => pickLang(l, "name", locale)}
                  getSearchText={(l) => `${l.name_en} ${l.name_as}`}
                  emptyText={t("draft.locationEmpty")}
                />
                <Input
                  id="chat-location-note"
                  label={t("draft.locationNote")}
                  placeholder={t("draft.locationNotePlaceholder")}
                  value={draft.location_note ?? ""}
                  maxLength={200}
                  onChange={(e) => patch({ location_note: e.target.value })}
                />
              </div>
            )}
          </Card>

          {/* Privacy as one question in the chat (sensitive ⇒ private, same rules as the form) */}
          <ol className="space-y-3">
            <Bubble role="assistant" label={t("civi")}>
              {t("privacy.ask")}
              {draft.is_sensitive_suggested && <span className="mt-1 block text-muted-foreground">{t("privacy.suggestSensitive")}</span>}
            </Bubble>
            {privacy ? (
              <>
                <Bubble role="user" label={t("you")}>{t(`privacy.options.${privacy}.label`)}</Bubble>
                <li className="flex flex-wrap items-center gap-2">
                  <span className="rounded-2xl rounded-bl-md border border-border bg-surface px-4 py-2.5 text-sm text-foreground">{t("privacy.ready")}</span>
                  <Button variant="ghost" size="sm" onClick={() => setPrivacy(null)}>{t("privacy.change")}</Button>
                </li>
              </>
            ) : (
              <li>
                <div role="radiogroup" aria-label={t("privacy.ask")} className="grid gap-2 sm:grid-cols-2">
                  {(draft.is_sensitive_suggested ? [PRIVACY[3], ...PRIVACY.slice(0, 3)] : PRIVACY).map(({ id, icon: Icon }) => (
                    <button
                      key={id}
                      type="button"
                      role="radio"
                      aria-checked={false}
                      onClick={() => setPrivacy(id)}
                      className="flex min-h-14 items-start gap-3 rounded-2xl border border-border bg-surface px-3.5 py-3 text-left transition hover:border-border-strong hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" strokeWidth={1.75} aria-hidden />
                      <span className="min-w-0">
                        <span className="flex flex-wrap items-center gap-1.5 text-sm font-semibold text-foreground">
                          {t(`privacy.options.${id}.label`)}
                          {draft.is_sensitive_suggested && id === "sensitive" && (
                            <span className="rounded-full bg-surface-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">{t("privacy.recommended")}</span>
                          )}
                        </span>
                        <span className="mt-0.5 block text-xs text-muted-foreground">{t(`privacy.options.${id}.hint`)}</span>
                      </span>
                    </button>
                  ))}
                </div>
              </li>
            )}
          </ol>

          {submit.isError && (
            <div role="alert" className="flex flex-wrap items-center gap-3 rounded-card border border-danger-border bg-danger-soft p-3 text-sm">
              <AlertTriangle className="size-4 shrink-0 text-danger" strokeWidth={1.75} aria-hidden />
              <span className="min-w-0 flex-1">{submitErrorText}</span>
              {!isApiError(submit.error, "RATE_LIMITED") && !isApiError(submit.error, "VALIDATION_ERROR") && (
                <Button size="sm" variant="secondary" onClick={doSubmit}>
                  <RotateCw aria-hidden strokeWidth={1.75} />
                  {tr("errors.retry")}
                </Button>
              )}
            </div>
          )}
        </div>
      )}

      <div ref={endRef} className="h-px" aria-hidden />

      {/* Pinned composer (sits above the mobile bottom nav; never covers the last message at full scroll) */}
      <div className="sticky bottom-[calc(5.25rem+env(safe-area-inset-bottom))] z-20 -mx-4 mt-4 space-y-2 bg-background px-4 pt-2 pb-2 sm:mx-0 sm:px-0 lg:bottom-4">
        {draft && privacy && !done && (
          <Button size="lg" block onClick={() => void onSubmit()} loading={submit.isPending || checking}>
            {!(submit.isPending || checking) && <Send aria-hidden strokeWidth={1.75} />}
            {submit.isPending ? t("submitting") : checking ? t("checking") : uploading ? t("waitingUploads") : t("submit")}
          </Button>
        )}
        {showErrors && uploadFailed && <p role="alert" className="text-xs font-medium text-danger">{tr("errors.uploadFailed")}</p>}

        {photos.length > 0 && (
          <ul className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]" aria-label={t("attach")}>
            {photos.map((p, i) => (
              <li key={p.id} className="relative size-14 shrink-0 overflow-hidden rounded-xl border border-border bg-surface-muted">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.url} alt={t("photoAlt", { n: n(i + 1) })} className={cn("size-full object-cover", p.status !== "done" && "opacity-60")} />
                {p.status === "uploading" && (
                  <span className="absolute inset-0 grid place-items-center" role="status">
                    <Loader2 className="size-4 animate-spin text-foreground" strokeWidth={1.75} aria-label={t("photoUploading")} />
                  </span>
                )}
                {p.status === "error" && (
                  <button type="button" onClick={() => upload(p)} className="absolute inset-0 grid place-items-center bg-danger-soft" aria-label={t("photoRetry")}>
                    <RotateCw className="size-4 text-danger" strokeWidth={1.75} aria-hidden />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => removePhoto(p.id)}
                  aria-label={t("removePhoto")}
                  className="absolute top-0 right-0 grid size-6 place-items-center rounded-bl-lg bg-surface text-foreground"
                >
                  <X className="size-3.5" strokeWidth={1.75} aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        )}

        {(recorder.state !== "idle" || recorder.error) && (
          <p role={recorder.error ? "alert" : "status"} className={cn("px-2 text-xs", recorder.error ? "font-medium text-danger" : "text-muted-foreground")}>
            {recorder.error ? tv(`errors.${recorder.error}`) : recorder.state === "recording" ? tv("listening") : tv("transcribing")}
          </p>
        )}
        {chatFull ? (
          <p className="rounded-card border border-border bg-surface px-4 py-3 text-sm text-muted-foreground">{t("full")}</p>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              send();
            }}
            className="flex items-end gap-2 rounded-[1.5rem] border border-border bg-surface p-1.5 shadow-sm focus-within:border-border-strong"
          >
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              multiple
              className="sr-only"
              tabIndex={-1}
              onChange={(e) => {
                void addFiles(e.target.files);
                e.target.value = "";
              }}
            />
            <Button
              variant="ghost"
              size="icon"
              aria-label={t("attach")}
              disabled={photos.length >= MAX_PHOTOS || done}
              onClick={() => fileRef.current?.click()}
            >
              <ImagePlus aria-hidden strokeWidth={1.75} />
            </Button>
            <label htmlFor="chat-input" className="sr-only">{t("placeholder")}</label>
            <textarea
              id="chat-input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  send();
                }
              }}
              rows={1}
              maxLength={MAX_TURN_CHARS}
              disabled={done}
              placeholder={t("placeholder")}
              className="field-sizing-content max-h-32 min-h-10 min-w-0 flex-1 resize-none bg-transparent px-1 py-2 text-base leading-6 text-foreground outline-none placeholder:text-subtle-foreground sm:text-sm"
            />
            {recorder.supported && (
              <Button
                variant="ghost"
                size="icon"
                aria-label={recorder.state === "recording" ? tv("stopMic") : tv("mic")}
                aria-pressed={recorder.state === "recording"}
                disabled={done || recorder.state === "transcribing" || turn.isPending}
                onClick={() => (recorder.state === "recording" ? recorder.stop() : void recorder.start())}
                className={cn(recorder.state === "recording" && "bg-danger-soft text-danger")}
              >
                {recorder.state === "transcribing" ? (
                  <Loader2 aria-hidden strokeWidth={1.75} className="animate-spin" />
                ) : recorder.state === "recording" ? (
                  <Square aria-hidden strokeWidth={1.75} />
                ) : (
                  <Mic aria-hidden strokeWidth={1.75} />
                )}
              </Button>
            )}
            <Button size="icon" type="submit" aria-label={t("send")} disabled={!canSend}>
              <Send aria-hidden strokeWidth={1.75} />
            </Button>
          </form>
        )}
      </div>

      {/* Same duplicate choice as the report form: Me too, or submit separately */}
      <Drawer
        open={dupOpen && similar.length > 0}
        onOpenChange={setDupOpen}
        side="center"
        title={tr("dup.title", { count: (similar[0]?.metoo_count ?? 0) + 1, n: n((similar[0]?.metoo_count ?? 0) + 1) })}
        description={tr("dup.body")}
        footer={
          <Button variant="secondary" onClick={doSubmit} block className="sm:w-auto" loading={submit.isPending}>
            {tr("dup.separate")}
          </Button>
        }
      >
        <ul className="space-y-3">
          {similar.map((item) => (
            <li key={item.id} className="rounded-2xl border border-border bg-surface p-3.5">
              <div className="flex gap-3">
                {item.photo_url && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={item.photo_url} alt="" className="size-16 shrink-0 rounded-xl border border-border object-cover" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <StatusChip status={item.status} />
                    <span className="font-mono text-xs text-muted-foreground">{item.code}</span>
                    <span className="ml-auto text-xs font-semibold">{tr("dup.match", { pct: n(Math.round(item.similarity * 100)) })}</span>
                  </div>
                  <LangText tag="h3" en={item.title_en} as={item.title_as} fallback={item.code} className="mt-1.5 text-sm font-semibold line-clamp-2" />
                  <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs text-muted-foreground">{tr("dup.people", { count: item.metoo_count + 1, n: n(item.metoo_count + 1) })}</span>
                    <Button size="sm" onClick={() => support.mutate(item.id)} loading={support.isPending && support.variables === item.id} disabled={support.isPending}>
                      {tr("dup.metoo")}
                    </Button>
                  </div>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </Drawer>
    </div>
  );
}

function Bubble({ role, label, children }: { role: "user" | "assistant"; label: string; children: React.ReactNode }) {
  const mine = role === "user";
  return (
    <li className={cn("flex", mine ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed break-words whitespace-pre-wrap",
          mine ? "rounded-br-md bg-primary text-primary-foreground" : "rounded-bl-md border border-border bg-surface text-foreground",
        )}
      >
        <span className="sr-only">{label}: </span>
        {children}
      </div>
    </li>
  );
}
