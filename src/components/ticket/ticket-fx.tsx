"use client";
/* eslint-disable @next/next/no-img-element -- signed Supabase URLs expire; skip the optimiser */

// Interactive pieces of the S08 ticket page: live timeline, animated lifecycle track, Me too counter,
// star rating, before/after slider, rating summary and the confirm-fixed celebration.
import { useId, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useLocale, useTranslations } from "next-intl";
import { ArrowRightLeft, Bot, CircleDot, CirclePlus, ImageOff, MessageSquareText, Star, ThumbsUp, UserCheck, type LucideIcon } from "lucide-react";
import type { Status } from "@/lib/domain";
import { cn, toLocaleDigits } from "@/lib/utils";
import { LifecycleTrack, RelativeTime, type TimelineItem } from "@/components/ui";

const SW = 1.75;

/* ---------- Live timeline ---------- */

const ICON: Record<string, LucideIcon> = {
  created: CirclePlus,
  status: ArrowRightLeft,
  assigned: UserCheck,
  note: MessageSquareText,
  metoo: ThumbsUp,
  ai: Bot,
};

/**
 * Same look as the kit's Timeline, but events that arrive after mount slide in, and the newest one
 * pulses once. Screen readers hear new events through a polite live region.
 */
export function LiveTimeline({ items, emptyText }: { items: TimelineItem[]; emptyText: string }) {
  const t = useTranslations("ticketFx");
  const reduce = useReducedMotion();
  // "Storing information from previous renders": ids seen so far, and the ones that just arrived.
  const [known, setKnown] = useState(() => new Set(items.map((i) => i.id)));
  const [fresh, setFresh] = useState<Set<string | number>>(() => new Set());
  const added = items.filter((i) => !known.has(i.id));
  if (added.length > 0) {
    setKnown(new Set([...known, ...added.map((i) => i.id)]));
    setFresh(new Set(added.map((i) => i.id)));
  }
  const lastFresh = items.filter((i) => fresh.has(i.id)).at(-1);
  const announce = lastFresh && typeof lastFresh.title === "string" ? t("newUpdate", { title: lastFresh.title }) : "";

  if (items.length === 0) return <p className="text-sm text-muted-foreground">{emptyText}</p>;
  return (
    <>
      <ol className="relative space-y-5">
        <AnimatePresence initial={false}>
          {items.map((item, i) => {
            const Icon = ICON[item.type] ?? CircleDot;
            const last = i === items.length - 1;
            const isNew = fresh.has(item.id);
            return (
              <motion.li
                key={item.id}
                layout={reduce ? false : "position"}
                initial={isNew && !reduce ? { opacity: 0, y: 12 } : false}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35, ease: "easeOut" }}
                className="relative flex gap-3"
              >
                {!last && <span aria-hidden className="absolute top-9 bottom-[-1.25rem] left-[1.0625rem] w-px bg-border" />}
                <span className="relative grid size-9 shrink-0 place-items-center">
                  {last && isNew && !reduce && (
                    <motion.span
                      aria-hidden
                      className="absolute inset-0 rounded-full bg-primary"
                      initial={{ opacity: 0.35, scale: 1 }}
                      animate={{ opacity: 0, scale: 1.9 }}
                      transition={{ duration: 1.1, ease: "easeOut" }}
                    />
                  )}
                  <span
                    className={cn(
                      "relative grid size-9 place-items-center rounded-full border transition-colors duration-300",
                      item.highlight ? "border-primary bg-primary text-primary-foreground" : "border-border bg-surface-muted text-muted-foreground",
                    )}
                  >
                    <Icon className="size-4" strokeWidth={SW} aria-hidden />
                  </span>
                </span>
                <div className="min-w-0 flex-1 pt-1">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                    <p className="text-sm font-medium">{item.title}</p>
                    <RelativeTime date={item.at} className="text-xs text-muted-foreground" />
                  </div>
                  {item.actor && <p className="text-xs text-muted-foreground">{item.actor}</p>}
                  {item.body && <div className="mt-1 text-sm text-muted-foreground">{item.body}</div>}
                </div>
              </motion.li>
            );
          })}
        </AnimatePresence>
      </ol>
      <p className="sr-only" role="status" aria-live="polite">
        {announce}
      </p>
    </>
  );
}

/* ---------- Lifecycle track that moves when the status changes ---------- */

export function LiveLifecycleTrack({ status, className }: { status: Status; className?: string }) {
  const reduce = useReducedMotion();
  const [prev, setPrev] = useState(status);
  const [moved, setMoved] = useState(false);
  if (status !== prev) {
    setPrev(status);
    setMoved(true);
  }
  const animate = moved && !reduce;
  return (
    <motion.div
      key={status}
      className={cn("rounded-xl", className)}
      initial={animate ? { opacity: 0.4, x: -8 } : false}
      animate={animate ? { opacity: 1, x: 0, scale: [1, 1.015, 1] } : { opacity: 1, x: 0 }}
      transition={{ duration: 0.6, ease: "easeOut" }}
    >
      <LifecycleTrack status={status} size="lg" />
    </motion.div>
  );
}

/* ---------- Me too ---------- */

export type MeTooState = "can" | "supported" | "own" | "private" | "closed" | "view";

/** One clear button with the affected count. The number rolls when it changes (optimistic or realtime). */
export function MeTooButton({
  state,
  count,
  pending,
  onPress,
}: {
  state: MeTooState;
  count: number;
  pending: boolean;
  onPress: () => void;
}) {
  const t = useTranslations("ticketFx");
  const locale = useLocale();
  const reduce = useReducedMotion();
  const reasonId = useId();
  const n = toLocaleDigits(count, locale);
  const reason = state === "own" ? t("metooOwn") : state === "private" ? t("metooPrivate") : state === "closed" ? t("metooClosed") : null;
  const active = state === "can";
  const pressed = state === "supported";

  return (
    <div className="flex min-w-0 flex-col items-start gap-1 sm:items-end">
      <button
        type="button"
        onClick={active ? onPress : undefined}
        disabled={!active || pending}
        aria-pressed={pressed}
        aria-label={t("metooAria", { n })}
        aria-describedby={reason ? reasonId : undefined}
        className={cn(
          "inline-flex min-h-11 items-center gap-2 rounded-full border px-4 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          active && "border-border-strong bg-surface hover:bg-surface-muted active:scale-[0.98]",
          pressed && "border-primary bg-primary text-primary-foreground",
          !active && !pressed && "cursor-not-allowed border-border bg-surface-muted text-muted-foreground",
          pending && "opacity-80",
        )}
      >
        <motion.span
          key={pressed ? "on" : "off"}
          initial={pressed && !reduce ? { scale: 0.6, rotate: -15 } : false}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: "spring", stiffness: 500, damping: 15 }}
          className="grid place-items-center"
        >
          <ThumbsUp className={cn("size-4", pressed && "fill-current")} strokeWidth={SW} aria-hidden />
        </motion.span>
        <span>{pressed ? t("metooYou") : t("metoo")}</span>
        <span
          className={cn(
            "relative inline-grid min-w-7 overflow-hidden rounded-full px-2 py-0.5 text-center text-xs tabular-nums",
            pressed ? "bg-primary-foreground/15" : "bg-surface-sunken",
          )}
          aria-hidden
        >
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.span
              key={count}
              initial={reduce ? false : { y: "100%", opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={reduce ? undefined : { y: "-100%", opacity: 0 }}
              transition={{ duration: 0.25 }}
              className="col-start-1 row-start-1"
            >
              {n}
            </motion.span>
          </AnimatePresence>
        </span>
      </button>
      <p className="text-xs text-muted-foreground" id={reason ? reasonId : undefined}>
        {reason ?? t("affected", { count, n })}
      </p>
    </div>
  );
}

/* ---------- Star rating (radio group, roving focus) ---------- */

export function StarRating({ value, onChange, label }: { value: number; onChange: (v: number) => void; label: string }) {
  const t = useTranslations("ticketFx");
  const tv = useTranslations("ticket.verify");
  const locale = useLocale();
  const reduce = useReducedMotion();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const [hover, setHover] = useState(0);
  const shown = hover || value;
  const focusIndex = value ? value - 1 : 0;

  const move = (to: number) => {
    const v = Math.min(5, Math.max(1, to));
    onChange(v);
    refs.current[v - 1]?.focus();
  };
  const onKey = (e: React.KeyboardEvent) => {
    const cur = value || 0;
    if (e.key === "ArrowRight" || e.key === "ArrowUp") move(cur + 1);
    else if (e.key === "ArrowLeft" || e.key === "ArrowDown") move(cur - 1);
    else if (e.key === "Home") move(1);
    else if (e.key === "End") move(5);
    else return;
    e.preventDefault();
  };

  return (
    <div className="flex flex-col items-center gap-1">
      <div role="radiogroup" aria-label={label} className="flex justify-center gap-0.5" onKeyDown={onKey} onPointerLeave={() => setHover(0)}>
        {[1, 2, 3, 4, 5].map((v) => (
          <button
            key={v}
            ref={(el) => {
              refs.current[v - 1] = el;
            }}
            type="button"
            role="radio"
            aria-checked={value === v}
            aria-label={`${tv("stars", { count: v, n: toLocaleDigits(v, locale) })}, ${t(`ratingWord${v}`)}`}
            tabIndex={v - 1 === focusIndex ? 0 : -1}
            onClick={() => onChange(v)}
            onPointerEnter={(e) => e.pointerType === "mouse" && setHover(v)}
            className="grid size-12 place-items-center rounded-full transition-colors hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <motion.span
              animate={!reduce && value === v ? { scale: [1, 1.25, 1] } : { scale: 1 }}
              transition={{ duration: 0.3 }}
              className="grid place-items-center"
            >
              <Star
                className={cn("size-8 transition-colors", v <= shown ? "fill-warning text-warning" : "text-subtle-foreground")}
                strokeWidth={SW}
                aria-hidden
              />
            </motion.span>
          </button>
        ))}
      </div>
      <p className="min-h-5 text-sm font-medium" aria-hidden>
        {shown ? t(`ratingWord${shown}`) : ""}
      </p>
    </div>
  );
}

/** Read-only rating + comment (ticket page and admin workspace). */
export function RatingSummary({ rating, comment, title, className }: { rating: number; comment?: string | null; title?: string; className?: string }) {
  const t = useTranslations("ticketFx");
  const locale = useLocale();
  const n = toLocaleDigits(rating, locale);
  return (
    <div className={cn("rounded-xl border border-border bg-surface-muted p-3", className)}>
      <p className="text-xs font-medium text-muted-foreground">{title ?? t("reporterFeedback")}</p>
      <p className="mt-1 flex flex-wrap items-center gap-2 text-sm">
        <span className="inline-flex" role="img" aria-label={t("ofFive", { n })}>
          {[1, 2, 3, 4, 5].map((v) => (
            <Star key={v} className={cn("size-4", v <= rating ? "fill-warning text-warning" : "text-subtle-foreground")} strokeWidth={SW} aria-hidden />
          ))}
        </span>
        <span className="font-medium" aria-hidden>
          {t("ofFive", { n })}
        </span>
        <span className="text-muted-foreground">· {t(`ratingWord${Math.min(5, Math.max(1, rating))}`)}</span>
      </p>
      {comment && <blockquote className="mt-2 border-l-2 border-border-strong pl-3 text-sm whitespace-pre-wrap">{comment}</blockquote>}
    </div>
  );
}

/* ---------- Before / after ---------- */

function Missing({ label }: { label: string }) {
  return (
    <div className="grid aspect-[4/3] place-items-center rounded-xl border border-dashed border-border bg-surface-sunken p-3 text-center text-xs text-muted-foreground">
      <span className="flex flex-col items-center gap-1.5">
        <ImageOff className="size-5 text-subtle-foreground" strokeWidth={SW} aria-hidden />
        {label}
      </span>
    </div>
  );
}

function Tag({ children, side }: { children: React.ReactNode; side: "left" | "right" }) {
  return (
    <span
      className={cn(
        "pointer-events-none absolute top-2 rounded-full border border-border bg-surface/90 px-2.5 py-0.5 text-xs font-medium text-foreground shadow-sm",
        side === "left" ? "left-2" : "right-2",
      )}
    >
      {children}
    </span>
  );
}

/** Draggable comparison slider; two images side by side when one is missing. */
export function BeforeAfter({ before, after }: { before: string | null; after: string | null }) {
  const t = useTranslations("ticketFx");
  const locale = useLocale();
  const [pos, setPos] = useState(50);
  const box = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const hintId = useId();

  if (!before && !after) return null;
  if (!before || !after) {
    return (
      <div className="grid grid-cols-2 gap-2">
        <figure className="min-w-0 space-y-1">
          {before ? <img src={before} alt={t("beforeAlt")} className="aspect-[4/3] w-full rounded-xl border border-border bg-surface-sunken object-cover" /> : <Missing label={t("noBefore")} />}
          <figcaption className="text-xs text-muted-foreground">{t("before")}</figcaption>
        </figure>
        <figure className="min-w-0 space-y-1">
          {after ? <img src={after} alt={t("afterAlt")} className="aspect-[4/3] w-full rounded-xl border border-border bg-surface-sunken object-cover" /> : <Missing label={t("noAfter")} />}
          <figcaption className="text-xs text-muted-foreground">{t("after")}</figcaption>
        </figure>
      </div>
    );
  }

  const fromPointer = (clientX: number) => {
    const r = box.current?.getBoundingClientRect();
    if (!r || r.width === 0) return;
    setPos(Math.round(Math.min(100, Math.max(0, ((clientX - r.left) / r.width) * 100))));
  };
  const onKey = (e: React.KeyboardEvent) => {
    const step = e.shiftKey ? 20 : 5;
    let next: number | null = null;
    if (e.key === "ArrowLeft" || e.key === "ArrowDown") next = pos - step;
    else if (e.key === "ArrowRight" || e.key === "ArrowUp") next = pos + step;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = 100;
    else if (e.key === "PageDown") next = pos - 20;
    else if (e.key === "PageUp") next = pos + 20;
    if (next === null) return;
    e.preventDefault();
    setPos(Math.min(100, Math.max(0, next)));
  };

  return (
    <figure className="space-y-1.5">
      <div
        ref={box}
        className="relative aspect-[4/3] touch-pan-y overflow-hidden rounded-xl border border-border bg-surface-sunken select-none"
        onPointerDown={(e) => {
          dragging.current = true;
          e.currentTarget.setPointerCapture(e.pointerId);
          fromPointer(e.clientX);
        }}
        onPointerMove={(e) => dragging.current && fromPointer(e.clientX)}
        onPointerUp={() => (dragging.current = false)}
        onPointerCancel={() => (dragging.current = false)}
      >
        <img src={after} alt={t("afterAlt")} draggable={false} className="absolute inset-0 size-full object-cover" />
        <img
          src={before}
          alt={t("beforeAlt")}
          draggable={false}
          className="absolute inset-0 size-full object-cover"
          style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }}
        />
        <Tag side="left">{t("before")}</Tag>
        <Tag side="right">{t("after")}</Tag>
        <div aria-hidden className="pointer-events-none absolute inset-y-0 w-0.5 -translate-x-1/2 bg-surface shadow" style={{ left: `${pos}%` }} />
        <div
          role="slider"
          tabIndex={0}
          aria-label={t("sliderLabel")}
          aria-describedby={hintId}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={pos}
          aria-valuetext={t("sliderValue", { n: toLocaleDigits(pos, locale) })}
          aria-orientation="horizontal"
          onKeyDown={onKey}
          className="absolute top-1/2 grid size-11 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize place-items-center rounded-full border border-border-strong bg-surface text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          style={{ left: `${pos}%` }}
        >
          <ArrowRightLeft className="size-4" strokeWidth={SW} aria-hidden />
        </div>
      </div>
      <figcaption id={hintId} className="text-xs text-muted-foreground">
        {t("sliderHint")}
      </figcaption>
    </figure>
  );
}

/* ---------- Celebration ---------- */

const CONFETTI_TONES = ["bg-foreground", "bg-success", "bg-warning", "bg-p3", "bg-border-strong"];

/** A one-shot confetti burst from the centre-top of the viewport. Renders nothing with reduced motion. */
export function Confetti({ fire }: { fire: number }) {
  const reduce = useReducedMotion();
  if (!fire || reduce) return null;
  // Pieces fade to opacity 0; the overlay ignores pointer events, so it can stay mounted.
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-[60] overflow-hidden">
      <Burst key={fire} seed={fire} />
    </div>
  );
}

function Burst({ seed }: { seed: number }) {
  // Deterministic pseudo-random so the pieces are stable across re-renders of one burst.
  const rnd = (i: number) => {
    const x = Math.sin(seed * 9301 + i * 49297) * 233280;
    return x - Math.floor(x);
  };
  const pieces = Array.from({ length: 36 }, (_, i) => {
    const angle = rnd(i) * Math.PI - Math.PI; // upward half circle
    const dist = 120 + rnd(i + 100) * 220;
    return {
      i,
      x: Math.cos(angle) * dist,
      y: Math.sin(angle) * dist,
      fall: 260 + rnd(i + 200) * 200,
      rot: (rnd(i + 300) - 0.5) * 720,
      tone: CONFETTI_TONES[i % CONFETTI_TONES.length],
      w: 6 + Math.round(rnd(i + 400) * 6),
      round: i % 3 === 0,
    };
  });
  return (
    <div className="absolute top-[38%] left-1/2">
      {pieces.map((p) => (
        <motion.span
          key={p.i}
          className={cn("absolute block", p.tone, p.round ? "rounded-full" : "rounded-[2px]")}
          style={{ width: p.w, height: p.round ? p.w : p.w * 0.45 }}
          initial={{ x: 0, y: 0, opacity: 1, rotate: 0, scale: 0.6 }}
          animate={{ x: [0, p.x, p.x * 1.1], y: [0, p.y, p.y + p.fall], opacity: [1, 1, 0], rotate: p.rot, scale: 1 }}
          transition={{ duration: 1.6, times: [0, 0.35, 1], ease: "easeOut" }}
        />
      ))}
    </div>
  );
}
