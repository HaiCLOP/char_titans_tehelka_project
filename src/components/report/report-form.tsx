"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { useReducedMotion } from "framer-motion";
import { toast } from "sonner";
import {
  AlertTriangle, ArrowDown, CheckCircle2, CloudUpload, EyeOff, Globe2, Lock, MapPin, Pencil, RotateCw, Send,
  ShieldAlert, ScanText, Sparkles, Undo2, Users,
} from "lucide-react";
import {
  CATEGORIES, COMPLAINTS_PER_HOUR, MAX_PHOTOS, type Category, type Intake, type LocationItem, type SimilarItem, type SubmitComplaintInput,
  type SubmitResult, type SupportResult, type UploadResult, type Visibility,
} from "@/lib/domain";
import type { IntakeResult } from "@/lib/ai/intake";
import { blobToDataURL } from "@/lib/image";
import { pickLang } from "@/lib/lang";
import { cn, toLocaleDigits } from "@/lib/utils";
import {
  Button, Card, CardHeader, CATEGORY_ICON, CategoryChip, Chip, Combobox, Drawer, Input, LangText, PhotoDropzone, PriorityChip, Select,
  Skeleton, SkeletonText, StatusChip, Switch, Tabs, Textarea, type PhotoItem,
} from "@/components/ui";
import { ApiError, apiFetch, isApiError, uploadWithProgress } from "@/components/api-client";
import { REPORT_DRAFT_KEY, REPORT_PHOTO_DRAFT_KEY } from "@/components/home/composer";
import { containsAbuse, filterAbusiveText } from "@/lib/moderation";
import { EmergencyBanner } from "./emergency-banner";

const MIN_CHARS = 15;
const MAX_TEXT = 2000;
// AI preview budget: wait for a real pause, skip small edits, never call more than once every few seconds.
const TYPE_IDLE_MS = 2500;
const PHOTO_IDLE_MS = 500;
const MIN_GAP_MS = 4000;

const normText = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();

/** True when `b` differs from `a` by more than a typo-sized edit (≥ 12 chars or ≥ 15 % of the text). */
function changedEnough(a: string, b: string) {
  if (a === b) return false;
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  let j = 0;
  while (j < a.length - i && j < b.length - i && a[a.length - 1 - j] === b[b.length - 1 - j]) j++;
  const changed = Math.max(a.length, b.length) - i - j;
  return changed >= 12 || changed / Math.max(a.length, b.length, 1) >= 0.15;
}

type Requested = { key: string; norm: string; photoKey: string; raw: string };

type UploadState = { status: "uploading"; pct: number } | { status: "done"; path: string } | { status: "error" };
type Preview = { key: string; intake: Intake; source: IntakeResult["source"]; model?: string };
type Overrides = Partial<Pick<Intake, "title_en" | "title_as" | "category" | "priority">>;

const fileName = (blob: Blob) => `photo.${blob.type === "image/webp" ? "webp" : blob.type === "image/png" ? "png" : "jpg"}`;

export type ReportFormProps = {
  initialLocationId?: string;
  initialCategory?: string;
};

export function ReportForm({ initialLocationId, initialCategory }: ReportFormProps = {}) {
  const t = useTranslations("report");
  const tc = useTranslations("category");
  const tp = useTranslations("priority");
  const locale = useLocale();
  const router = useRouter();
  const reduceMotion = useReducedMotion();

  const initialValidCat = initialCategory && (CATEGORIES as readonly string[]).includes(initialCategory) ? (initialCategory as Category) : null;
  const [userCategory, setUserCategory] = useState<Category | "auto">(initialValidCat ?? "auto");

  // ---------- form state ----------
  const [text, setText] = useState("");
  const [photos, setPhotos] = useState<PhotoItem[]>([]);
  const [uploads, setUploads] = useState<Record<string, UploadState>>({});
  const [location, setLocation] = useState<LocationItem | null>(null);
  const [locationNote, setLocationNote] = useState("");
  const [visibility, setVisibility] = useState<Visibility>("public");
  const [anonymous, setAnonymous] = useState(false);
  const [sensitive, setSensitive] = useState(false);
  const [sensitiveAuto, setSensitiveAuto] = useState(false);
  const [showErrors, setShowErrors] = useState(false);

  // ---------- AI preview state ----------
  const [preview, setPreview] = useState<Preview | null>(null);
  const [failedKey, setFailedKey] = useState<string | null>(null);
  const [retryNonce, setRetryNonce] = useState(0);
  const [overrides, setOverrides] = useState<Overrides>(initialValidCat ? { category: initialValidCat } : {});
  const [editing, setEditing] = useState(false);
  const [similar, setSimilar] = useState<{ key: string; items: SimilarItem[] } | null>(null);
  const [dupOpen, setDupOpen] = useState(false);
  const [supportingId, setSupportingId] = useState<string | null>(null);

  const trimmed = text.trim();
  const canAnalyze = trimmed.length >= MIN_CHARS || photos.length > 0;
  const photoKey = photos.map((p) => p.id).join(",");
  const candidateNorm = normText(trimmed);
  // The input last sent to the AI. Small edits after it don't trigger a new call; the preview stays valid.
  const [requested, setRequested] = useState<Requested | null>(null);
  const needsRequest =
    canAnalyze && (!requested || requested.photoKey !== photoKey || changedEnough(requested.norm, candidateNorm));
  const previewStatus: "idle" | "loading" | "ready" | "error" = !canAnalyze
    ? "idle"
    : requested && preview?.key === requested.key
      ? "ready"
      : requested && failedKey === requested.key
        ? "error"
        : "loading";
  const similarKey = requested ? `${requested.key}|${location?.id ?? ""}` : null;

  // Prefill from the home-page composer (sessionStorage, never the URL).
  useEffect(() => {
    let draft: string | null = null;
    let photoDraft: string | null = null;
    try {
      draft = sessionStorage.getItem(REPORT_DRAFT_KEY);
      photoDraft = sessionStorage.getItem(REPORT_PHOTO_DRAFT_KEY);
      sessionStorage.removeItem(REPORT_DRAFT_KEY);
      sessionStorage.removeItem(REPORT_PHOTO_DRAFT_KEY);
    } catch {
      /* storage blocked: start empty */
    }
    if (draft) {
      const value = draft.slice(0, MAX_TEXT);
      setTimeout(() => setText((cur) => (cur.trim() ? cur : value)), 0);
    }
    if (photoDraft) {
      fetch(photoDraft)
        .then((r) => r.blob())
        .then((blob) => {
          const id = Math.random().toString(36).slice(2, 9);
          const url = URL.createObjectURL(blob);
          const item: PhotoItem = { id, blob, url, name: "photo.jpg" };
          setPhotos((cur) => (cur.length === 0 ? [item] : cur));
        })
        .catch(() => {});
    }
  }, []);

  // Prefill location from the URL (e.g. from the campus map).
  useEffect(() => {
    if (!initialLocationId) return;
    const ctrl = new AbortController();
    apiFetch<LocationItem>(`/api/locations?id=${encodeURIComponent(initialLocationId)}`, { signal: ctrl.signal })
      .then((loc) => {
        if (loc) setLocation(loc);
      })
      .catch(() => {});
    return () => ctrl.abort();
  }, [initialLocationId]);

  // Latest values for async callbacks (updated after render, read only inside timers/promises).
  const latest = useRef({ text, photos, location, sensitive });
  useEffect(() => {
    latest.current = { text, photos, location, sensitive };
  });
  const sensitiveUserOff = useRef(false);
  const dismissedKey = useRef<string | null>(null);
  const dataUrls = useRef(new Map<string, Promise<string>>());
  const uploadCtrls = useRef(new Map<string, AbortController>());

  const dataUrlFor = useCallback((p: PhotoItem) => {
    let v = dataUrls.current.get(p.id);
    if (!v) {
      v = blobToDataURL(p.blob);
      dataUrls.current.set(p.id, v);
    }
    return v;
  }, []);

  // ---------- AI preview: scheduled, deduplicated, cached ----------
  const lastStart = useRef(0);
  const results = useRef(new Map<string, Preview>());
  const commitRequest = useCallback(() => {
    const { text: txt, photos: pics } = latest.current;
    const raw = txt.trim();
    const norm = normText(raw);
    const pk = pics.map((p) => p.id).join(",");
    setRequested((prev) => (prev && prev.norm === norm && prev.photoKey === pk ? prev : { key: `${norm}|${pk}`, norm, photoKey: pk, raw }));
  }, []);

  // Schedule a call only when the input changed enough; photos go fast, typing waits for a real pause.
  useEffect(() => {
    if (!needsRequest) return;
    const photoChange = !requested || requested.photoKey !== photoKey;
    const wait = Math.max(photoChange && photos.length > 0 ? PHOTO_IDLE_MS : TYPE_IDLE_MS, lastStart.current + MIN_GAP_MS - Date.now());
    const timer = setTimeout(commitRequest, wait);
    return () => clearTimeout(timer);
  }, [needsRequest, candidateNorm, photoKey, photos.length, requested, commitRequest]);

  // One request per committed input; results are cached so undoing an edit costs nothing.
  useEffect(() => {
    if (!requested) return;
    const key = requested.key;
    const cached = results.current.get(key);
    // Only successful AI answers are cached, so a retry after a failure always reaches the network.
    if (cached) {
      setPreview(cached);
      setFailedKey(null);
      return;
    }
    const ctrl = new AbortController();
    lastStart.current = Date.now();
    (async () => {
      const { photos: pics, location: loc } = latest.current;
      try {
        const images = await Promise.all(pics.map(dataUrlFor));
        const res = await apiFetch<IntakeResult>("/api/ai/analyze", {
          method: "POST",
          json: { text: requested.raw, images, ...(loc ? { locationName: loc.name_en } : {}) },
          signal: ctrl.signal,
        });
        if (ctrl.signal.aborted) return;
        const next: Preview = { key, intake: res.intake, source: res.source, model: res.model };
        if (res.source === "ai") results.current.set(key, next);
        setPreview(next);
        setFailedKey(null);
        if (res.intake.is_sensitive_suggested && !latest.current.sensitive && !sensitiveUserOff.current) {
          setSensitive(true);
          setSensitiveAuto(true);
        }
      } catch (e) {
        if (ctrl.signal.aborted || (e instanceof DOMException && e.name === "AbortError")) return;
        setFailedKey(key);
      }
    })();
    return () => ctrl.abort();
  }, [requested, retryNonce, dataUrlFor]);

  // Duplicate check: re-runs for a new preview or a new location, never calls the language model.
  const previewKey = preview?.key;
  const previewSummary = preview?.source === "ai" ? preview.intake.summary_en : null;
  const locationId = location?.id ?? null;
  useEffect(() => {
    if (!similarKey || !previewSummary || previewKey !== requested?.key) return;
    const ctrl = new AbortController();
    (async () => {
      try {
        const items = await apiFetch<SimilarItem[]>("/api/complaints/similar", {
          method: "POST",
          json: { summary_en: previewSummary, location_id: locationId },
          signal: ctrl.signal,
        });
        if (ctrl.signal.aborted) return;
        const top = items.slice(0, 3);
        setSimilar({ key: similarKey, items: top });
        if (top.length > 0 && dismissedKey.current !== similarKey) setDupOpen(true);
      } catch {
        // 503 AI_UNAVAILABLE or any other failure ⇒ no duplicate step.
        if (!ctrl.signal.aborted) setSimilar({ key: similarKey, items: [] });
      }
    })();
    return () => ctrl.abort();
  }, [similarKey, previewKey, previewSummary, locationId, requested?.key]);

  // ---------- photos + uploads ----------
  const startUpload = useCallback((p: PhotoItem) => {
    const ctrl = new AbortController();
    uploadCtrls.current.set(p.id, ctrl);
    setUploads((u) => ({ ...u, [p.id]: { status: "uploading", pct: 0 } }));
    const form = new FormData();
    form.append("file", p.blob, fileName(p.blob));
    uploadWithProgress<UploadResult>(
      "/api/upload",
      form,
      (pct) => setUploads((u) => (u[p.id]?.status === "uploading" ? { ...u, [p.id]: { status: "uploading", pct } } : u)),
      ctrl.signal,
    )
      .then((r) => setUploads((u) => (p.id in u ? { ...u, [p.id]: { status: "done", path: r.path } } : u)))
      .catch((e) => {
        if (e instanceof DOMException && e.name === "AbortError") return;
        setUploads((u) => (p.id in u ? { ...u, [p.id]: { status: "error" } } : u));
      })
      .finally(() => uploadCtrls.current.delete(p.id));
  }, []);

  const onPhotos = (next: PhotoItem[]) => {
    const ids = new Set(next.map((p) => p.id));
    for (const p of photos) {
      if (!ids.has(p.id)) {
        uploadCtrls.current.get(p.id)?.abort();
        dataUrls.current.delete(p.id);
      }
    }
    setUploads((u) => Object.fromEntries(Object.entries(u).filter(([id]) => ids.has(id))));
    setPhotos(next);
    for (const p of next) if (!(p.id in uploads)) startUpload(p);
  };

  useEffect(() => {
    const ctrls = uploadCtrls.current;
    return () => ctrls.forEach((c) => c.abort());
  }, []);

  const uploadList = photos.map((p) => uploads[p.id] ?? ({ status: "uploading", pct: 0 } as UploadState));
  const uploading = uploadList.some((u) => u.status === "uploading");
  const uploadFailed = uploadList.some((u) => u.status === "error");

  // ---------- privacy ----------
  const effectiveVisibility: Visibility = sensitive ? "private" : visibility;
  const toggleSensitive = (on: boolean) => {
    setSensitive(on);
    setSensitiveAuto(false);
    if (!on) sensitiveUserOff.current = true;
  };

  // ---------- effective intake (AI preview + the user's edits) ----------
  // The preview is only sent with the report when it describes what is written now (small edits are fine).
  const current = preview && requested && preview.key === requested.key && !needsRequest ? preview : null;
  const shown = canAnalyze ? preview : null; // stale preview stays visible while the next one loads
  const effective: Intake | null = shown
    ? {
        ...shown.intake,
        ...overrides,
        ...(userCategory !== "auto" ? { category: userCategory } : {}),
      }
    : userCategory !== "auto"
      ? ({
          title_en: text.slice(0, 80) || "Issue report",
          title_as: text.slice(0, 80) || "সমস্যা প্ৰতিবেদন",
          summary_en: text.slice(0, 400),
          summary_as: text.slice(0, 400),
          category: userCategory,
          priority: 3,
          priority_reason_en: "",
          location_hint: null,
          is_abusive: false,
          has_personal_data: false,
          is_urgent: false,
          is_sensitive_suggested: false,
          confidence: 1,
          is_relevant: true,
          rejection_reason_en: null,
          rejection_reason_as: null,
          has_abusive_image: false,
          has_explicit_image: false,
          has_ai_image: false,
          image_rejection_reason_en: null,
          image_rejection_reason_as: null,
        } as Intake)
      : null;
  const effectiveCategory: Category = userCategory !== "auto" ? userCategory : (effective?.category ?? "other");
  const isRelevant = effective?.is_relevant !== false;
  const isAbusive = Boolean(effective?.is_abusive) || containsAbuse(text);
  const hasAbusiveImage = Boolean(effective?.has_abusive_image);
  const hasExplicitImage = Boolean(effective?.has_explicit_image);
  const hasAiImage = Boolean(effective?.has_ai_image);
  const isBlocked = !isRelevant || hasExplicitImage || hasAiImage || isAbusive || hasAbusiveImage;
  const titleField = locale === "as" ? "title_as" : "title_en";
  const titleMax = locale === "as" ? 120 : 90;
  const editedTitle = overrides[titleField];
  const titleError = editedTitle !== undefined && editedTitle.trim().length < 3 ? t("preview.titleTooShort") : null;
  const isUrgent = Boolean(effective?.is_urgent);
  const similarItems = similar && similar.key === similarKey ? similar.items : [];

  // ---------- submit ----------
  const submit = useMutation({
    mutationFn: (body: SubmitComplaintInput) => apiFetch<SubmitResult>("/api/complaints", { method: "POST", json: body }),
    onSuccess: (r) => router.push(`/report/done?id=${encodeURIComponent(r.id)}`),
  });

  const missingContent = trimmed.length === 0 && photos.length === 0;
  const onSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    setShowErrors(true);

    // Automatically sanitize and mask any abusive terms
    let cleanText = trimmed;
    if (containsAbuse(cleanText)) {
      const sanitized = filterAbusiveText(cleanText);
      cleanText = sanitized.cleanText;
      setText(cleanText);
    }

    if (missingContent || titleError || uploading || uploadFailed || isBlocked) {
      if (isAbusive || hasAbusiveImage) toast.error(t("moderation.cannotSubmitAbuse"));
      else if (!isRelevant) toast.error(t("rejection.cannotSubmit"));
      else if (hasExplicitImage || hasAiImage) toast.error(t("imageModeration.cannotSubmit"));
      return;
    }
    const intake = current
      ? {
          ...current.intake,
          ...overrides,
          ...(userCategory !== "auto" ? { category: userCategory } : {}),
          [titleField]: (overrides[titleField] ?? current.intake[titleField]).trim(),
        }
      : effective && userCategory !== "auto"
        ? {
            ...effective,
            category: userCategory,
            [titleField]: (overrides[titleField] ?? effective[titleField]).trim(),
          }
        : undefined;
    submit.mutate({
      text: cleanText,
      image_paths: uploadList.flatMap((u) => (u.status === "done" ? [u.path] : [])),
      location_id: location?.id ?? null,
      location_note: locationNote.trim() || null,
      visibility: effectiveVisibility,
      anonymous,
      is_sensitive: sensitive,
      ...(intake && (current || userCategory !== "auto")
        ? {
            intake,
            intake_source: current ? current.source : "fallback",
            ...(current?.model ? { intake_model: current.model } : {}),
          }
        : {}),
    });
  };

  // ---------- Me too ----------
  const support = useMutation({
    mutationFn: (id: string) => apiFetch<SupportResult>(`/api/complaints/${encodeURIComponent(id)}/support`, { method: "POST" }),
    onMutate: (id) => setSupportingId(id),
    onSuccess: (_r, id) => {
      toast.success(t("dup.supported"));
      setDupOpen(false);
      router.push(`/c/${encodeURIComponent(id)}`);
    },
    onError: (e) => toast.error(isApiError(e, "VALIDATION_ERROR") ? t("dup.ownReport") : t("dup.supportFailed")),
    onSettled: () => setSupportingId(null),
  });

  const closeDup = () => {
    dismissedKey.current = similar?.key ?? null;
    setDupOpen(false);
  };

  // ---------- mobile sticky "Review" bar ----------
  const reviewRef = useRef<HTMLDivElement>(null);
  const [reviewVisible, setReviewVisible] = useState(false);
  useEffect(() => {
    const el = reviewRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([entry]) => setReviewVisible(entry.isIntersecting), { threshold: 0.15 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  const goReview = () => reviewRef.current?.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });

  const loadLocations = useCallback(
    (q: string, signal: AbortSignal) => apiFetch<LocationItem[]>(`/api/locations?q=${encodeURIComponent(q)}`, { signal }),
    [],
  );

  const n = (v: number) => toLocaleDigits(v, locale);
  const rateLimited = isApiError(submit.error, "RATE_LIMITED");

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-5">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{t("title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>

      <form onSubmit={onSubmit} noValidate className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_24rem] lg:items-start">
        <div className="min-w-0 space-y-5">
          {/* Description */}
          <Card>
            <Textarea
              id="report-text"
              label={t("description.label")}
              hint={t("description.hint")}
              placeholder={t("description.placeholder")}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onBlur={() => {
                if (containsAbuse(text)) {
                  const { cleanText } = filterAbusiveText(text);
                  setText(cleanText);
                  toast.info(t("moderation.abusiveWordFiltered"));
                }
                if (needsRequest) commitRequest();
              }}
              maxLength={MAX_TEXT}
              showCount
              rows={5}
              error={showErrors && missingContent ? t("errors.needContent") : undefined}
            />
          </Card>

          {/* Photos */}
          <Card>
            <PhotoDropzone id="report-photos" label={t("photos.label")} value={photos} onChange={onPhotos} max={MAX_PHOTOS} disabled={submit.isPending} />
            {photos.length > 0 && (
              <ul className="mt-3 space-y-2" aria-label={t("photos.statusLabel")}>
                {photos.map((p, i) => {
                  const u = uploadList[i];
                  return (
                    <li key={p.id} className="flex items-center gap-3 text-xs">
                      <span className="w-16 shrink-0 text-muted-foreground">{t("photos.item", { n: n(i + 1) })}</span>
                      {u.status === "uploading" && (
                        <>
                          <span className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-surface-muted" aria-hidden>
                            <span className="block h-full rounded-full bg-primary transition-[width]" style={{ width: `${u.pct}%` }} />
                          </span>
                          <span className="shrink-0 text-muted-foreground" role="status">
                            {t("photos.uploading", { pct: n(u.pct) })}
                          </span>
                        </>
                      )}
                      {u.status === "done" && (
                        <span className="inline-flex items-center gap-1 text-foreground">
                          <CheckCircle2 className="size-3.5 text-p4" aria-hidden />
                          {t("photos.uploaded")}
                        </span>
                      )}
                      {u.status === "error" && (
                        <>
                          <span className="inline-flex flex-1 items-center gap-1 font-medium text-danger" role="alert">
                            <AlertTriangle className="size-3.5" aria-hidden />
                            {t("photos.failed")}
                          </span>
                          <Button size="sm" variant="secondary" onClick={() => startUpload(p)}>
                            <RotateCw aria-hidden />
                            {t("photos.retry")}
                          </Button>
                        </>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          {/* Category */}
          <Card className="space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-title text-[1.0625rem]">{t("category.label")}</h2>
                <p className="text-xs text-muted-foreground">{t("category.hint")}</p>
              </div>
              {userCategory !== "auto" && (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setUserCategory("auto");
                    setOverrides((o) => {
                      const next = { ...o };
                      delete next.category;
                      return next;
                    });
                  }}
                  className="shrink-0 text-xs"
                >
                  <RotateCw className="size-3.5" aria-hidden />
                  {t("category.autoOption")}
                </Button>
              )}
            </div>

            {/* Mobile: compact single-row horizontal scrolling chips (saves ~400px vertical space on phones) */}
            <div className="sm:hidden -mx-1 px-1">
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none]">
                <button
                  type="button"
                  onClick={() => {
                    setUserCategory("auto");
                    setOverrides((o) => {
                      const next = { ...o };
                      delete next.category;
                      return next;
                    });
                  }}
                  className={cn(
                    "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition",
                    userCategory === "auto"
                      ? "border-primary bg-primary text-primary-foreground font-semibold shadow-xs"
                      : "border-border bg-surface text-muted-foreground hover:text-foreground",
                  )}
                >
                  <Sparkles className="size-3" aria-hidden />
                  <span>{t("category.autoOption")}</span>
                </button>
                {CATEGORIES.map((c) => {
                  const Icon = CATEGORY_ICON[c];
                  const isSelected = effectiveCategory === c;
                  const isManual = userCategory === c;
                  return (
                    <button
                      key={c}
                      type="button"
                      onClick={() => {
                        setUserCategory(c);
                        setOverrides((o) => ({ ...o, category: c }));
                      }}
                      className={cn(
                        "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition",
                        isSelected
                          ? "border-primary bg-primary text-primary-foreground font-semibold shadow-xs"
                          : "border-border bg-surface text-muted-foreground hover:text-foreground",
                      )}
                    >
                      <Icon className="size-3.5" strokeWidth={2} aria-hidden />
                      <span>{tc(c)}</span>
                      {isSelected && !isManual && (
                        <span className="rounded-full bg-primary-foreground/20 px-1 py-0.2 text-[9px] font-bold">
                          AI
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Tablet & Desktop: clean responsive grid */}
            <div className="hidden sm:grid sm:grid-cols-3 md:grid-cols-4 gap-2">
              {CATEGORIES.map((c) => {
                const Icon = CATEGORY_ICON[c];
                const isSelected = effectiveCategory === c;
                const isManual = userCategory === c;
                return (
                  <button
                    key={c}
                    type="button"
                    onClick={() => {
                      setUserCategory(c);
                      setOverrides((o) => ({ ...o, category: c }));
                    }}
                    className={cn(
                      "group flex flex-col items-start gap-2 rounded-xl border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      isSelected
                        ? "border-primary bg-primary/10 text-primary ring-1 ring-primary"
                        : "border-border bg-surface text-foreground hover:border-border-strong hover:bg-surface-muted/50",
                    )}
                  >
                    <div className="flex w-full items-center justify-between">
                      <span
                        className={cn(
                          "grid size-7 place-items-center rounded-lg transition-colors",
                          isSelected ? "bg-primary text-primary-foreground" : "bg-surface-muted text-muted-foreground group-hover:text-foreground",
                        )}
                      >
                        <Icon className="size-4" strokeWidth={1.75} aria-hidden />
                      </span>
                      {isSelected && !isManual && (
                        <span className="rounded-full bg-primary/20 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                          AI
                        </span>
                      )}
                    </div>
                    <span className="text-xs font-medium leading-tight">{tc(c)}</span>
                  </button>
                );
              })}
            </div>
          </Card>

          {/* Location */}
          <Card className="space-y-4">
            <Combobox<LocationItem>
              id="report-location"
              label={t("location.label")}
              hint={t("location.hint")}
              placeholder={t("location.placeholder")}
              value={location}
              onChange={setLocation}
              loadOptions={loadLocations}
              getKey={(l) => l.id}
              getLabel={(l) => pickLang(l, "name", locale)}
              getSearchText={(l) => `${l.name_en} ${l.name_as}`}
              renderOption={(l) => (
                <span className="flex flex-col">
                  <span lang={locale}>{pickLang(l, "name", locale)}</span>
                  <span className="text-xs text-muted-foreground" lang={locale === "as" ? "en" : "as"}>
                    {locale === "as" ? l.name_en : l.name_as}
                  </span>
                </span>
              )}
              emptyText={t("location.empty")}
            />
            <Input
              id="report-location-note"
              label={t("location.noteLabel")}
              placeholder={t("location.notePlaceholder")}
              value={locationNote}
              onChange={(e) => setLocationNote(e.target.value)}
              maxLength={200}
            />
          </Card>

          {/* Privacy */}
          <Card className="space-y-5">
            <CardHeader as="h2" title={t("privacy.title")} className="mb-0" />
            <div>
              <p id="visibility-label" className="text-sm font-medium">
                {t("privacy.visibility")}
              </p>
              <div role="radiogroup" aria-labelledby="visibility-label" className="mt-2 grid grid-cols-2 gap-2">
                {(["public", "private"] as const).map((v) => {
                  const on = effectiveVisibility === v;
                  const Icon = v === "public" ? Globe2 : Lock;
                  return (
                    <button
                      key={v}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      disabled={sensitive}
                      onClick={() => setVisibility(v)}
                      className={cn(
                        "flex h-11 items-center justify-center gap-2 rounded-full border text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60",
                        on ? "border-foreground bg-surface text-foreground ring-1 ring-foreground" : "border-border bg-surface text-muted-foreground hover:text-foreground",
                      )}
                    >
                      <Icon className="size-4" aria-hidden />
                      {t(`privacy.${v}`)}
                    </button>
                  );
                })}
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                {sensitive ? t("privacy.forcedPrivate") : t(`privacy.${effectiveVisibility}Hint`)}
              </p>
            </div>
            <Switch
              id="report-anonymous"
              checked={anonymous}
              onCheckedChange={setAnonymous}
              label={
                <span className="inline-flex items-center gap-1.5">
                  <EyeOff className="size-4 text-muted-foreground" aria-hidden />
                  {t("privacy.anonymous")}
                </span>
              }
              description={t("privacy.anonymousHint")}
            />
            <div>
              <Switch
                id="report-sensitive"
                checked={sensitive}
                onCheckedChange={toggleSensitive}
                label={
                  <span className="inline-flex items-center gap-1.5">
                    <ShieldAlert className="size-4 text-muted-foreground" aria-hidden />
                    {t("privacy.sensitive")}
                  </span>
                }
                description={t("privacy.sensitiveHint")}
              />
              {sensitiveAuto && sensitive && (
                <div className="mt-3 flex flex-wrap items-center gap-2 rounded-field bg-surface-muted px-3 py-2 text-xs text-foreground" role="status">
                  <ScanText className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                  <span className="min-w-0 flex-1">{t("privacy.sensitiveAuto")}</span>
                  <Button size="sm" variant="ghost" onClick={() => toggleSensitive(false)}>
                    <Undo2 aria-hidden />
                    {t("privacy.undo")}
                  </Button>
                </div>
              )}
            </div>
          </Card>
        </div>

        {/* Review column: AI preview, duplicates, urgent banner, submit */}
        <div ref={reviewRef} id="review" className="min-w-0 scroll-mt-4 space-y-4 lg:sticky lg:top-4">
          <Card aria-live="polite" aria-busy={previewStatus === "loading" || undefined}>
            <CardHeader
              as="h2"
              icon={<ScanText className="size-4 text-muted-foreground" aria-hidden />}
              title={t("preview.title")}
              action={
                effective && previewStatus !== "idle" ? (
                  <Button size="sm" variant={editing ? "soft" : "ghost"} onClick={() => setEditing((v) => !v)} aria-pressed={editing}>
                    <Pencil aria-hidden />
                    {editing ? t("preview.done") : t("preview.edit")}
                  </Button>
                ) : undefined
              }
              className="mb-3"
            />

            {previewStatus === "idle" && <p className="text-sm text-muted-foreground">{t("preview.idle", { n: n(MIN_CHARS) })}</p>}

            {previewStatus === "loading" && !effective && (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">{t("preview.analysing")}</p>
                <Skeleton className="h-5 w-3/4" />
                <SkeletonText lines={3} />
                <div className="flex gap-2">
                  <Skeleton className="h-6 w-24 rounded-full" />
                  <Skeleton className="h-6 w-20 rounded-full" />
                </div>
              </div>
            )}

            {previewStatus === "error" && !effective && (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">{t("preview.failed")}</p>
                <Button size="sm" variant="secondary" onClick={() => setRetryNonce((x) => x + 1)}>
                  <RotateCw aria-hidden />
                  {t("preview.retry")}
                </Button>
              </div>
            )}

            {effective && shown && (
              <div className={cn("space-y-3", previewStatus === "loading" && "opacity-70")}>
                {previewStatus === "loading" && <p className="text-xs text-muted-foreground">{t("preview.updating")}</p>}
                {previewStatus === "error" && (
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    {t("preview.failed")}
                    <Button size="sm" variant="ghost" onClick={() => setRetryNonce((x) => x + 1)}>
                      <RotateCw aria-hidden />
                      {t("preview.retry")}
                    </Button>
                  </div>
                )}
                {shown.source === "fallback" && (
                  <p className="flex items-start gap-2 rounded-xl bg-surface-muted px-3 py-2 text-xs" role="status">
                    <CloudUpload className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                    {t("preview.fallback")}
                  </p>
                )}
                {effective.is_urgent && (
                  <Chip tone="danger" size="md" icon={AlertTriangle}>
                    {t("preview.urgent")}
                  </Chip>
                )}

                {editing ? (
                  <div className="space-y-3">
                    <Input
                      id="preview-title"
                      label={t("preview.titleLabel")}
                      value={effective[titleField]}
                      maxLength={titleMax}
                      onChange={(e) => setOverrides((o) => ({ ...o, [titleField]: e.target.value }))}
                      error={titleError ?? undefined}
                      lang={locale}
                    />
                    <Select
                      id="preview-category"
                      label={t("preview.categoryLabel")}
                      value={effective.category}
                      onChange={(e) => {
                        const nextCat = e.target.value as Category;
                        setUserCategory(nextCat);
                        setOverrides((o) => ({ ...o, category: nextCat }));
                      }}
                      options={CATEGORIES.map((c) => ({ value: c, label: tc(c) }))}
                    />
                    <Select
                      id="preview-priority"
                      label={t("preview.priorityLabel")}
                      value={String(effective.priority)}
                      onChange={(e) => setOverrides((o) => ({ ...o, priority: Number(e.target.value) }))}
                      options={[1, 2, 3, 4].map((p) => ({ value: String(p), label: `P${n(p)} · ${tp(String(p))}` }))}
                    />
                    {(Object.keys(overrides).length > 0 || userCategory !== "auto") && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setUserCategory("auto");
                          setOverrides({});
                        }}
                      >
                        <Undo2 aria-hidden />
                        {t("preview.reset")}
                      </Button>
                    )}
                  </div>
                ) : (
                  <>
                    <LangText tag="h3" en={effective.title_en} as={effective.title_as} className="font-semibold" />
                    <div className="flex flex-wrap gap-1.5">
                      <CategoryChip category={effective.category} />
                      <PriorityChip priority={effective.priority} showCode />
                      {Object.keys(overrides).length > 0 && <Chip tone="accent">{t("preview.edited")}</Chip>}
                    </div>
                    {effective.priority_reason_en && (
                      <p className="text-xs text-muted-foreground">
                        <span className="font-medium text-foreground">{t("preview.why")}</span>{" "}
                        <span lang="en">{effective.priority_reason_en}</span>
                      </p>
                    )}
                  </>
                )}

                <Tabs
                  label={t("preview.summary")}
                  defaultValue={locale === "as" ? "as" : "en"}
                  fill
                  items={[
                    { value: "en", label: t("preview.tabEn"), content: <p lang="en" className="text-sm">{effective.summary_en}</p> },
                    { value: "as", label: <span lang="as">{t("preview.tabAs")}</span>, content: <p lang="as" className="text-sm">{effective.summary_as}</p> },
                  ]}
                />

                {effective.location_hint && (
                  <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
                    <MapPin className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                    <span>
                      {t("preview.detectedPlace")} <span className="font-medium text-foreground">{effective.location_hint}</span>
                      {!location && <> · {t("preview.pickPlace")}</>}
                    </span>
                  </p>
                )}
              </div>
            )}
          </Card>

          {similarItems.length > 0 && !dupOpen && (
            <Card className="flex flex-wrap items-center gap-3 p-4">
              <Users className="size-5 shrink-0 text-muted-foreground" aria-hidden />
              <p className="min-w-0 flex-1 text-sm">{t("dup.found", { count: similarItems.length, n: n(similarItems.length) })}</p>
              <Button size="sm" variant="soft" onClick={() => setDupOpen(true)}>
                {t("dup.view")}
              </Button>
            </Card>
          )}

          {isUrgent && <EmergencyBanner />}

          {/* Moderation & Relevance Alerts */}
          {effective && !isRelevant && (
            <div role="alert" className="rounded-xl border border-danger/30 bg-danger/10 p-4 text-xs">
              <div className="flex items-start gap-2.5">
                <AlertTriangle className="size-4 shrink-0 text-danger mt-0.5" />
                <div>
                  <p className="font-semibold text-danger">{t("rejection.title")}</p>
                  <p className="mt-1 text-foreground/90 leading-relaxed">
                    {locale === "as" ? (effective.rejection_reason_as || t("rejection.body")) : (effective.rejection_reason_en || t("rejection.body"))}
                  </p>
                </div>
              </div>
            </div>
          )}

          {effective && hasExplicitImage && (
            <div role="alert" className="rounded-xl border border-danger/30 bg-danger/10 p-4 text-xs">
              <div className="flex items-start gap-2.5">
                <ShieldAlert className="size-4 shrink-0 text-danger mt-0.5" />
                <div>
                  <p className="font-semibold text-danger">{t("imageModeration.explicitTitle")}</p>
                  <p className="mt-1 text-foreground/90 leading-relaxed">
                    {locale === "as" ? (effective.image_rejection_reason_as || t("imageModeration.explicitBody")) : (effective.image_rejection_reason_en || t("imageModeration.explicitBody"))}
                  </p>
                </div>
              </div>
            </div>
          )}

          {effective && hasAiImage && (
            <div role="alert" className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-xs">
              <div className="flex items-start gap-2.5">
                <AlertTriangle className="size-4 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
                <div>
                  <p className="font-semibold text-amber-700 dark:text-amber-300">{t("imageModeration.aiTitle")}</p>
                  <p className="mt-1 text-foreground/90 leading-relaxed">
                    {locale === "as" ? (effective.image_rejection_reason_as || t("imageModeration.aiBody")) : (effective.image_rejection_reason_en || t("imageModeration.aiBody"))}
                  </p>
                </div>
              </div>
            </div>
          )}

          {effective && hasAbusiveImage && (
            <div role="alert" className="rounded-xl border border-danger/30 bg-danger/10 p-4 text-xs">
              <div className="flex items-start gap-2.5">
                <ShieldAlert className="size-4 shrink-0 text-danger mt-0.5" />
                <div>
                  <p className="font-semibold text-danger">{t("moderation.abusiveImageTitle")}</p>
                  <p className="mt-1 text-foreground/90 leading-relaxed">
                    {locale === "as" ? (effective.image_rejection_reason_as || t("moderation.abusiveImageBody")) : (effective.image_rejection_reason_en || t("moderation.abusiveImageBody"))}
                  </p>
                </div>
              </div>
            </div>
          )}

          {effective && isAbusive && (
            <div role="alert" className="rounded-xl border border-danger/30 bg-danger/10 p-4 text-xs">
              <div className="flex items-start gap-2.5">
                <AlertTriangle className="size-4 shrink-0 text-danger mt-0.5" />
                <div>
                  <p className="font-semibold text-danger">{t("moderation.abusiveTitle")}</p>
                  <p className="mt-1 text-foreground/90 leading-relaxed">
                    {locale === "as" ? (effective.abusive_reason_as || t("moderation.abusiveBody")) : (effective.abusive_reason_en || t("moderation.abusiveBody"))}
                  </p>
                </div>
              </div>
            </div>
          )}

          {rateLimited && (
            <div role="alert" className="rounded-card border border-p2/40 bg-p2/10 p-4 text-sm">
              <p className="font-semibold">{t("errors.rateLimitedTitle")}</p>
              <p className="mt-1 text-muted-foreground">{t("errors.rateLimited", { n: n(COMPLAINTS_PER_HOUR) })}</p>
            </div>
          )}
          {submit.isError && !rateLimited && (
            <div role="alert" className="flex flex-wrap items-center gap-3 rounded-card border border-danger-border bg-danger-soft p-4 text-sm">
              <AlertTriangle className="size-5 shrink-0 text-danger" aria-hidden />
              <p className="min-w-0 flex-1">
                {submit.error instanceof ApiError && submit.error.code === "NETWORK" ? t("errors.network") : t("errors.submitFailed")}
              </p>
              <Button size="sm" variant="secondary" onClick={() => onSubmit()}>
                <RotateCw aria-hidden />
                {t("errors.retry")}
              </Button>
            </div>
          )}
          {showErrors && (uploading || uploadFailed) && (
            <p role="alert" className="text-xs font-medium text-danger">
              {uploadFailed ? t("errors.uploadFailed") : t("errors.uploadPending")}
            </p>
          )}
          {showErrors && missingContent && (
            <p role="alert" className="text-xs font-medium text-danger">
              {t("errors.needContent")}
            </p>
          )}

          <Button type="submit" size="lg" block loading={submit.isPending} disabled={rateLimited || isBlocked}>
            {!submit.isPending && <Send aria-hidden />}
            {submit.isPending
              ? t("submitting")
              : uploading
                ? t("waitingUploads")
                : isBlocked
                  ? isAbusive || hasAbusiveImage
                    ? t("moderation.cannotSubmitAbuse")
                    : isRelevant
                      ? t("imageModeration.cannotSubmit")
                      : t("rejection.cannotSubmit")
                  : t("submit")}
          </Button>
          <p className="text-center text-xs text-muted-foreground">{t("submitHint")}</p>
        </div>
      </form>

      {/* Spacer so the sticky bar never covers the submit button on mobile. */}
      <div className="h-24 lg:hidden" aria-hidden />
      {!reviewVisible && (
        <div className="fixed inset-x-3 bottom-[calc(5.25rem+env(safe-area-inset-bottom))] z-30 rounded-full border border-border bg-surface/95 py-2 pr-2 pl-5 shadow-rail backdrop-blur-md lg:hidden">
          <div className="mx-auto flex max-w-md items-center gap-3">
            <p className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
              {previewStatus === "ready" ? t("sticky.ready") : previewStatus === "loading" ? t("preview.analysing") : t("sticky.hint")}
            </p>
            <Button onClick={goReview}>
              <ArrowDown aria-hidden />
              {t("sticky.review")}
            </Button>
          </div>
        </div>
      )}

      <Drawer
        open={dupOpen && similarItems.length > 0}
        onOpenChange={(o) => (o ? setDupOpen(true) : closeDup())}
        side="center"
        title={t("dup.title", { count: (similarItems[0]?.metoo_count ?? 0) + 1, n: n((similarItems[0]?.metoo_count ?? 0) + 1) })}
        description={t("dup.body")}
        footer={
          <Button variant="secondary" onClick={closeDup} block className="sm:w-auto">
            {t("dup.separate")}
          </Button>
        }
      >
        {/* Your currently uploaded photo reference (for direct visual comparison) */}
        {photos.length > 0 && photos[0]?.url && (
          <div className="mb-3.5 flex items-center gap-3 rounded-xl border border-border/80 bg-surface-muted/60 p-2.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={photos[0].url}
              alt={t("dup.yourPhoto")}
              className="size-14 rounded-lg object-cover border border-border shrink-0 shadow-2xs"
            />
            <div className="min-w-0 flex-1">
              <span className="block text-[10px] font-bold uppercase tracking-wider text-primary">
                {t("dup.yourPhoto")}
              </span>
              <span className="block text-xs font-semibold text-foreground truncate mt-0.5">
                {text.trim() || t("dup.yourPhoto")}
              </span>
            </div>
          </div>
        )}

        <ul className="space-y-3">
          {similarItems.map((item) => (
            <li key={item.id} className="rounded-2xl border border-border bg-surface p-3.5 sm:p-4 shadow-2xs transition-all hover:border-border-strong">
              <div className="flex gap-3 sm:gap-3.5">
                {/* Uploaded photo of the already reported complaint */}
                {item.photo_url && (
                  <div className="shrink-0">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={item.photo_url}
                      alt={item.title_en ?? item.code}
                      className="size-20 sm:size-24 rounded-xl object-cover border border-border/80 shadow-2xs"
                    />
                  </div>
                )}

                <div className="min-w-0 flex-1 flex flex-col justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <StatusChip status={item.status} />
                      <span className="font-mono text-xs text-muted-foreground">{item.code}</span>
                      <span className="ml-auto text-xs font-bold text-primary">
                        {t("dup.match", { pct: n(Math.round(item.similarity * 100)) })}
                      </span>
                    </div>
                    <LangText
                      tag="h3"
                      en={item.title_en}
                      as={item.title_as}
                      fallback={item.code}
                      className="mt-1.5 text-xs sm:text-sm font-semibold text-foreground line-clamp-2"
                    />
                  </div>

                  <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2">
                    <span className="text-[11px] text-muted-foreground">
                      {t("dup.people", { count: item.metoo_count + 1, n: n(item.metoo_count + 1) })}
                    </span>
                    <Button
                      size="sm"
                      onClick={() => support.mutate(item.id)}
                      loading={supportingId === item.id}
                      disabled={support.isPending}
                    >
                      {t("dup.metoo")}
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
