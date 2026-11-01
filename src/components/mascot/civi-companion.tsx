"use client";

import { useEffect, useRef, useState, type FormEvent, type PointerEvent, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { useMutation } from "@tanstack/react-query";
import {
  ArrowLeft,
  ArrowRight,
  Bot,
  ClipboardList,
  Compass,
  FileText,
  Loader2,
  Map,
  MessageCircleQuestion,
  MessagesSquare,
  Mic,
  SendHorizontal,
  Wrench,
  X,
} from "lucide-react";
import { apiFetch, isApiError } from "@/components/api-client";
import { Civi, type CiviPose } from "./civi";

/** Mirrors AskAnswer in src/lib/assist/ask.ts (server-only). */
type AskAction = "report_chat" | "report" | "my" | "map" | "pulse" | "none";
type AskAnswer = { answer: string; lang: "en" | "as"; action: AskAction; sources: { code: string; title: string }[] };

type View = "menu" | "ask";
type TipKey =
  | "home" | "report" | "voice" | "map" | "pulse" | "departments" | "department" | "my" | "ticket" | "staff"
  | "admin" | "adminQueue" | "adminAgent" | "adminMap" | "adminTicket" | "default";

const EXACT_TIPS: Record<string, TipKey> = {
  "/": "home",
  "/report": "report",
  "/report/voice": "voice",
  "/map": "map",
  "/pulse": "pulse",
  "/departments": "departments",
  "/my": "my",
  "/staff": "staff",
  "/admin": "admin",
  "/admin/queue": "adminQueue",
  "/admin/agent": "adminAgent",
  "/admin/map": "adminMap",
};

function tipFor(path: string): TipKey {
  if (EXACT_TIPS[path]) return EXACT_TIPS[path];
  if (path.startsWith("/departments/")) return "department";
  if (path.startsWith("/c/")) return "ticket";
  if (path.startsWith("/admin/t/")) return "adminTicket";
  if (path.startsWith("/staff")) return "staff";
  return "default";
}

const IDLE_POSE: Partial<Record<TipKey, CiviPose>> = {
  report: "helping", voice: "learning", map: "thinking", pulse: "learning", ticket: "thinking", adminMap: "thinking",
};

const ACTION_HREF: Record<Exclude<AskAction, "none">, string> = {
  report_chat: "/report/chat", report: "/report", my: "/my", map: "/map", pulse: "/pulse",
};

// Pages where Civi already fills the screen, or where a floating button would get in the way.
const HIDDEN_ON = ["/report/chat", "/login", "/onboarding"];

export function CiviCompanion() {
  const pathname = usePathname();
  const router = useRouter();
  const t = useTranslations("mascot");
  const reduceMotion = useReducedMotion();
  const rootRef = useRef<HTMLElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [position, setPosition] = useState({ right: 16, bottom: 16 });
  const positionRef = useRef(position);
  const dragRef = useRef<{ x: number; y: number; right: number; bottom: number; moved: boolean } | null>(null);
  const suppressClick = useRef(false);

  const [open, setOpen] = useState(false);
  const [view, setView] = useState<View>("menu");
  const [hover, setHover] = useState(false);
  const [question, setQuestion] = useState("");
  const [bubbleVisible, setBubbleVisible] = useState(true);
  const [prevPath, setPrevPath] = useState(pathname);

  const ask = useMutation({
    mutationFn: (q: string) => apiFetch<AskAnswer>("/api/ask", { method: "POST", json: { question: q } }),
  });

  if (prevPath !== pathname) {
    setPrevPath(pathname);
    setBubbleVisible(true);
    setOpen(false);
  }

  const place = (right: number, bottom: number) => {
    const size = rootRef.current?.getBoundingClientRect();
    const next = {
      right: Math.max(12, Math.min(right, window.innerWidth - (size?.width ?? 72) - 12)),
      bottom: Math.max(12, Math.min(bottom, window.innerHeight - (size?.height ?? 72) - 12)),
    };
    positionRef.current = next;
    setPosition(next);
  };
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("cs_civi_position") ?? "null");
      if (saved && Number.isFinite(saved.right) && Number.isFinite(saved.bottom)) place(saved.right, saved.bottom);
    } catch {}
    const resize = () => place(positionRef.current.right, positionRef.current.bottom);
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);
  useEffect(() => { place(positionRef.current.right, positionRef.current.bottom); }, [open, view, ask.status]);
  useEffect(() => {
    const timer = setTimeout(() => setBubbleVisible(false), 7000);
    return () => clearTimeout(timer);
  }, [pathname]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);
  useEffect(() => { if (open && view === "ask") inputRef.current?.focus(); }, [open, view]);

  const startDrag = (event: PointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return;
    suppressClick.current = false;
    setBubbleVisible(false);
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { x: event.clientX, y: event.clientY, ...positionRef.current, moved: false };
  };
  const moveDrag = (event: PointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    const dx = event.clientX - drag.x, dy = event.clientY - drag.y;
    if (Math.hypot(dx, dy) > 5) drag.moved = true;
    if (drag.moved) place(drag.right - dx, drag.bottom - dy);
  };
  const endDrag = () => {
    suppressClick.current = dragRef.current?.moved ?? false;
    dragRef.current = null;
    try { localStorage.setItem("cs_civi_position", JSON.stringify(positionRef.current)); } catch {}
  };

  if (HIDDEN_ON.includes(pathname)) return null;

  const tip = tipFor(pathname);
  const isAdmin = pathname.startsWith("/admin");
  const isStaff = pathname.startsWith("/staff");

  // Civi's face follows what it is doing: thinking while it answers, happy with an answer, concerned on an error.
  const pose: CiviPose = !open
    ? hover ? "happy" : IDLE_POSE[tip] ?? "hero"
    : view === "menu"
      ? "helping"
      : ask.isPending ? "thinking" : ask.isError ? "concerned" : ask.isSuccess ? "happy" : "learning";

  const go = (href: string) => { setOpen(false); router.push(href); };
  const startTour = () => {
    setOpen(false);
    if (isAdmin) window.dispatchEvent(new CustomEvent("civicsense:open-admin-tour"));
    else if (pathname === "/") window.dispatchEvent(new CustomEvent("civicsense:open-civi-tour"));
    else router.push("/?tour=true");
  };
  const openAsk = () => { setView("ask"); ask.reset(); };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const q = question.trim();
    if (q.length < 2 || ask.isPending) return;
    ask.mutate(q);
  };
  const toggle = () => {
    if (suppressClick.current) { suppressClick.current = false; return; }
    setBubbleVisible(false);
    setOpen((o) => { if (!o) setView("menu"); return !o; });
  };

  const errorText = ask.error
    ? isApiError(ask.error, "UNAUTHENTICATED") ? t("ask.signIn")
      : isApiError(ask.error, "RATE_LIMITED") ? t("ask.rateLimited")
      : t("ask.failed")
    : null;

  const menu: { icon: ReactNode; label: string; hint?: string; onClick: () => void; primary?: boolean }[] = isAdmin
    ? [
        { icon: <MessageCircleQuestion className="size-4" strokeWidth={1.75} />, label: t("menu.ask"), hint: t("menu.askHint"), onClick: openAsk, primary: true },
        { icon: <Bot className="size-4" strokeWidth={1.75} />, label: t("menu.agent"), onClick: () => go("/admin/agent") },
        { icon: <ClipboardList className="size-4" strokeWidth={1.75} />, label: t("menu.queue"), onClick: () => go("/admin/queue") },
        { icon: <Map className="size-4" strokeWidth={1.75} />, label: t("menu.map"), onClick: () => go("/admin/map") },
        { icon: <Compass className="size-4" strokeWidth={1.75} />, label: t("menu.tour"), onClick: startTour },
      ]
    : [
        { icon: <MessagesSquare className="size-4" strokeWidth={1.75} />, label: t("menu.reportChat"), hint: t("menu.reportChatHint"), onClick: () => go("/report/chat"), primary: true },
        { icon: <MessageCircleQuestion className="size-4" strokeWidth={1.75} />, label: t("menu.ask"), hint: t("menu.askHint"), onClick: openAsk, primary: true },
        ...(isStaff ? [{ icon: <Wrench className="size-4" strokeWidth={1.75} />, label: t("menu.jobs"), onClick: () => go("/staff") }] : []),
        { icon: <FileText className="size-4" strokeWidth={1.75} />, label: t("menu.reportForm"), onClick: () => go("/report") },
        { icon: <Mic className="size-4" strokeWidth={1.75} />, label: t("menu.voice"), onClick: () => go("/report/voice") },
        { icon: <ClipboardList className="size-4" strokeWidth={1.75} />, label: t("menu.my"), onClick: () => go("/my") },
        { icon: <Map className="size-4" strokeWidth={1.75} />, label: t("menu.map"), onClick: () => go("/map") },
        { icon: <Compass className="size-4" strokeWidth={1.75} />, label: t("menu.tour"), onClick: startTour },
      ];

  return (
    <aside
      ref={rootRef}
      style={position}
      aria-label={t("assistant")}
      className="pointer-events-none fixed z-40 flex max-w-[calc(100vw-1.5rem)] flex-col items-end"
    >
      <AnimatePresence>
        {open && (
          <motion.div
            key="panel"
            role="dialog"
            aria-label={t("assistant")}
            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.94, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.94, y: 12 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            style={{ transformOrigin: "bottom right" }}
            className="pointer-events-auto mb-2 flex max-h-[min(34rem,calc(100dvh-7rem))] w-[22rem] max-w-[calc(100vw-1.5rem)] flex-col overflow-hidden rounded-card border border-border bg-surface shadow-xl dark:shadow-black/50"
          >
            <div className="flex items-center gap-2 border-b border-border px-4 py-3">
              {view === "ask" && (
                <button
                  type="button"
                  onClick={() => setView("menu")}
                  className="-ml-2 grid size-10 place-items-center rounded-full text-muted-foreground hover:bg-surface-muted hover:text-foreground"
                  aria-label={t("back")}
                >
                  <ArrowLeft className="size-4" strokeWidth={1.75} />
                </button>
              )}
              <div className="min-w-0 flex-1">
                <h2 className="text-sm font-bold tracking-tight text-foreground">{view === "ask" ? t("ask.title") : t("title")}</h2>
                <p className="truncate text-xs text-muted-foreground">{view === "ask" ? t("ask.subtitle") : t(`tips.${tip}`)}</p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="-mr-2 grid size-10 place-items-center rounded-full text-muted-foreground hover:bg-surface-muted hover:text-foreground"
                aria-label={t("close")}
              >
                <X className="size-4" strokeWidth={1.75} />
              </button>
            </div>

            {view === "menu" ? (
              <div className="overflow-y-auto p-2">
                {menu.map((item) => (
                  <button
                    key={item.label}
                    type="button"
                    onClick={item.onClick}
                    className="flex min-h-11 w-full items-center gap-3 rounded-2xl px-3 py-2 text-left transition-colors hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <span
                      className={
                        item.primary
                          ? "grid size-9 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground"
                          : "grid size-9 shrink-0 place-items-center rounded-full bg-surface-muted text-foreground"
                      }
                    >
                      {item.icon}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-foreground">{item.label}</span>
                      {item.hint && <span className="block text-xs text-muted-foreground">{item.hint}</span>}
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <div className="flex min-h-0 flex-1 flex-col">
                <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4" aria-live="polite">
                  {ask.isIdle && (
                    <div className="space-y-2">
                      <p className="text-xs text-muted-foreground">{t("ask.try")}</p>
                      {(["s1", "s2", "s3"] as const).map((k) => (
                        <button
                          key={k}
                          type="button"
                          onClick={() => { const q = t(`ask.suggest.${k}`); setQuestion(q); ask.mutate(q); }}
                          className="block min-h-10 w-full rounded-2xl border border-border px-3 py-2 text-left text-sm text-foreground hover:bg-surface-muted"
                        >
                          {t(`ask.suggest.${k}`)}
                        </button>
                      ))}
                    </div>
                  )}
                  {ask.isPending && (
                    <p className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="size-4 animate-spin" strokeWidth={1.75} aria-hidden />
                      {t("ask.thinking")}
                    </p>
                  )}
                  {errorText && (
                    <div className="rounded-2xl bg-danger-soft px-3 py-2 text-sm text-foreground">
                      {errorText}
                      {isApiError(ask.error, "UNAUTHENTICATED") && (
                        <Link href={`/login?next=${encodeURIComponent(pathname)}`} className="ml-1 font-semibold underline">
                          {t("ask.signInLink")}
                        </Link>
                      )}
                    </div>
                  )}
                  {ask.data && (
                    <div className="space-y-3">
                      <p
                        lang={ask.data.lang}
                        className="whitespace-pre-line rounded-2xl bg-surface-muted px-3 py-2.5 text-sm leading-relaxed text-foreground"
                      >
                        {ask.data.answer}
                      </p>
                      {ask.data.sources.length > 0 && (
                        <div className="space-y-1">
                          <p className="text-xs font-medium text-muted-foreground">{t("ask.sources")}</p>
                          {ask.data.sources.map((s) => (
                            <Link
                              key={s.code}
                              href={`/c/${s.code}`}
                              onClick={() => setOpen(false)}
                              className="flex min-h-10 items-center gap-2 rounded-xl px-2 text-xs text-foreground hover:bg-surface-muted"
                            >
                              <span className="font-mono text-muted-foreground">{s.code}</span>
                              <span className="truncate">{s.title}</span>
                            </Link>
                          ))}
                        </div>
                      )}
                      {ask.data.action !== "none" && (
                        <button
                          type="button"
                          onClick={() => go(ACTION_HREF[ask.data.action as Exclude<AskAction, "none">])}
                          className="inline-flex min-h-10 items-center gap-1.5 rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground hover:opacity-90"
                        >
                          {t(`ask.actions.${ask.data.action}`)}
                          <ArrowRight className="size-4" strokeWidth={1.75} aria-hidden />
                        </button>
                      )}
                    </div>
                  )}
                </div>
                <form onSubmit={submit} className="flex items-center gap-2 border-t border-border p-3">
                  <input
                    ref={inputRef}
                    value={question}
                    onChange={(e) => setQuestion(e.target.value)}
                    maxLength={400}
                    placeholder={t("ask.placeholder")}
                    aria-label={t("ask.placeholder")}
                    className="min-h-10 min-w-0 flex-1 rounded-full border border-border bg-surface-sunken px-4 text-sm text-foreground placeholder:text-subtle-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                  <button
                    type="submit"
                    disabled={question.trim().length < 2 || ask.isPending}
                    className="grid size-10 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground disabled:opacity-40"
                    aria-label={t("ask.send")}
                  >
                    <SendHorizontal className="size-4" strokeWidth={1.75} />
                  </button>
                </form>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <div className="pointer-events-auto flex items-end gap-2">
        <AnimatePresence>
          {bubbleVisible && !open && (
            <motion.button
              type="button"
              initial={{ opacity: 0, x: 10, scale: 0.95 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ duration: 0.18 }}
              onClick={() => { setBubbleVisible(false); setView("menu"); setOpen(true); }}
              className="hidden max-w-xs rounded-2xl border border-border bg-surface px-3.5 py-2 text-left text-xs font-medium text-foreground shadow-lg hover:bg-surface-muted sm:block dark:shadow-black/40"
            >
              <span className="line-clamp-2 leading-relaxed">{t(`tips.${tip}`)}</span>
            </motion.button>
          )}
        </AnimatePresence>
        <button
          type="button"
          onClick={toggle}
          onPointerDown={startDrag}
          onPointerMove={moveDrag}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onPointerEnter={() => setHover(true)}
          onPointerLeave={() => setHover(false)}
          aria-expanded={open}
          aria-haspopup="dialog"
          title={t("dragHint")}
          aria-label={open ? t("close") : t("open")}
          className="relative flex min-h-12 min-w-12 cursor-grab touch-none select-none items-center justify-center rounded-full bg-transparent p-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing"
        >
          <motion.span
            key={pose}
            initial={reduceMotion ? false : { scale: 0.88, rotate: -6 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: "spring", stiffness: 420, damping: 18 }}
            className="block"
          >
            <Civi pose={pose} size="md" interactive={!open && !reduceMotion} />
          </motion.span>
        </button>
      </div>
    </aside>
  );
}
