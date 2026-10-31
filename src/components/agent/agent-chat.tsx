"use client";

import { useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { AlertTriangle, ArrowUp, ChevronDown, MessagesSquare, RotateCcw, RotateCw } from "lucide-react";
import { AreaTrend, Button, EmptyState } from "@/components/ui";
import type { AgentAnswer, AgentChart, AgentLang, AgentTrace } from "@/lib/agent/schema";
import { cn, isAssameseText, toLocaleDigits } from "@/lib/utils";

/*
 * S16 chat. Answers arrive as one validated JSON object (the router fails over between models, so the
 * reply is not streamed); while waiting the bubble shows what the assistant is doing, step by step.
 */

type Dept = { id: string; name_en: string; name_as: string };
type ErrorInfo = { code: string; retryAfterSec?: number };
type Turn = { id: number; question: string; answer?: AgentAnswer; error?: ErrorInfo; pending?: boolean };

const SUGGESTIONS_SUPER = ["hostelWater", "deptMost", "overdue", "trend"] as const;
const SUGGESTIONS_DEPT = ["hostelWater", "categories", "overdue", "trend"] as const;
const QUESTIONS_PER_HOUR = 30;

function Bars({ rows, lang, n }: { rows: { label: string; value: number }[]; lang: AgentLang; n: (v: number) => string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <ul className="space-y-2.5">
      {rows.map((r) => (
        <li key={r.label}>
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span lang={lang} className="min-w-0 truncate text-muted-foreground">{r.label}</span>
            <span className="tabular font-semibold">{n(r.value)}</span>
          </div>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-muted" aria-hidden>
            <div className="h-full rounded-full bg-foreground/80" style={{ width: `${(r.value / max) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

function Chart({ chart, lang }: { chart: AgentChart; lang: AgentLang }) {
  const t = useTranslations("agent.chart");
  const locale = useLocale();
  const n = (v: number) => toLocaleDigits(v, locale);
  if (chart.type === "line") {
    return (
      <div className="mt-4 rounded-2xl border border-border p-4">
        <AreaTrend series={chart.series} compare={chart.compare} height={96} label={t("trendAria", { values: chart.series.map(n).join(", ") })} />
        <div className="mt-3 flex items-center gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5"><span className="h-0.5 w-4 rounded-full bg-foreground" aria-hidden />{t("reported")}</span>
          <span className="flex items-center gap-1.5"><span className="h-0 w-4 border-t border-dashed border-subtle-foreground" aria-hidden />{t("resolved")}</span>
        </div>
      </div>
    );
  }
  const rows = chart.rows.map((r) => ({ label: lang === "as" ? r.label_as : r.label_en, value: r.value }));
  return (
    <div className="mt-4 rounded-2xl border border-border p-4" role="img" aria-label={t("barAria", { values: rows.map((r) => `${r.label} ${n(r.value)}`).join(", ") })}>
      <Bars rows={rows} lang={lang} n={n} />
    </div>
  );
}

function TraceList({ trace, model, ms, lang }: { trace: AgentTrace[]; model: string; ms: number; lang: AgentLang }) {
  const t = useTranslations("agent");
  const locale = useLocale();
  const n = (v: number | string) => toLocaleDigits(v, locale);
  return (
    <details className="group mt-4 border-t border-border pt-3">
      <summary className="flex cursor-pointer list-none items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground [&::-webkit-details-marker]:hidden">
        <ChevronDown className="size-4 transition-transform group-open:rotate-180" strokeWidth={1.75} aria-hidden />
        {t("trace.toggle")}
      </summary>
      <div className="mt-3 space-y-2.5">
        {trace.length === 0 && <p className="text-sm text-muted-foreground">{t("trace.none")}</p>}
        {trace.map((step, i) => (
          <div key={i} className="rounded-xl bg-surface-muted px-3 py-2.5 text-sm">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <span className="font-medium">
                {t(`tools.${step.tool}`)} <code className="ml-1 text-xs text-muted-foreground">{step.tool}</code>
              </span>
              <span className="tabular text-xs text-muted-foreground">{t("trace.ms", { n: n(step.ms) })}</span>
            </div>
            {Object.keys(step.input).length > 0 && (
              <p className="mt-1 font-mono text-xs break-words text-muted-foreground">
                {Object.entries(step.input).map(([k, v]) => `${k}=${typeof v === "string" ? v : JSON.stringify(v)}`).join(" · ")}
              </p>
            )}
            <p className={cn("mt-1 text-xs", step.ok ? "text-muted-foreground" : "text-danger")}>
              {step.ok ? (
                <>
                  {t("trace.rows", { n: step.rows, count: n(step.rows) })}
                  {step.top && (
                    <span lang={lang}>
                      {" · "}
                      {t("trace.top", { label: lang === "as" ? step.top.label_as : step.top.label_en, value: n(step.top.value) })}
                    </span>
                  )}
                </>
              ) : (
                t("trace.failed")
              )}
            </p>
          </div>
        ))}
        <p className="text-xs text-muted-foreground">{t("trace.meta", { model, seconds: n((ms / 1000).toFixed(1)) })}</p>
      </div>
    </details>
  );
}

function Thinking() {
  const t = useTranslations("agent.thinking");
  const [phase, setPhase] = useState<"read" | "tools" | "writing">("read");
  useEffect(() => {
    const a = setTimeout(() => setPhase("tools"), 1500);
    const b = setTimeout(() => setPhase("writing"), 7000);
    return () => { clearTimeout(a); clearTimeout(b); };
  }, []);
  return (
    <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status" aria-live="polite">
      <span className="flex gap-1" aria-hidden>
        {[0, 1, 2].map((i) => (
          <span key={i} className="size-1.5 animate-pulse rounded-full bg-muted-foreground motion-reduce:animate-none" style={{ animationDelay: `${i * 200}ms` }} />
        ))}
      </span>
      {t(phase)}
    </p>
  );
}

function useErrorText() {
  const t = useTranslations("agent");
  const locale = useLocale();
  return (e: ErrorInfo) => {
  switch (e.code) {
    case "RATE_LIMITED":
      return t("errors.rateLimited", {
        limit: toLocaleDigits(QUESTIONS_PER_HOUR, locale),
        minutes: toLocaleDigits(Math.max(1, Math.ceil((e.retryAfterSec ?? 60) / 60)), locale),
      });
    case "AI_UNAVAILABLE": return t("errors.aiUnavailable");
    case "FORBIDDEN": return t("errors.forbidden");
    case "VALIDATION_ERROR": return t("errors.validation");
    default: return t("errors.generic");
  }
  };
}

export function AgentChat({ role, departments }: { role: "dept_admin" | "super_admin"; departments: Dept[] }) {
  const t = useTranslations("agent");
  const tu = useTranslations("ui");
  const errorText = useErrorText();
  const locale = useLocale();
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState("");
  const [department, setDepartment] = useState("");
  const nextId = useRef(1);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const busy = turns.some((x) => x.pending);
  const isSuper = role === "super_admin";

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  }, [turns]);

  async function ask(question: string, replaceId?: number) {
    const q = question.trim();
    if (q.length < 2 || busy) return;
    const id = replaceId ?? nextId.current++;
    // History = earlier answered turns (not the one being retried).
    const history = turns
      .filter((x) => x.answer && x.id !== id)
      .slice(-6)
      .flatMap((x) => [{ role: "user" as const, text: x.question }, { role: "assistant" as const, text: x.answer!.answer }]);
    setTurns((prev) =>
      replaceId ? prev.map((x) => (x.id === id ? { id, question: q, pending: true } : x)) : [...prev, { id, question: q, pending: true }],
    );
    setDraft("");
    let next: Turn;
    try {
      const res = await fetch("/api/admin/agent", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question: q, history, department_id: isSuper && department ? department : null }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        next = { id, question: q, error: { code: body?.error?.code ?? "INTERNAL", retryAfterSec: Number(res.headers.get("retry-after")) || undefined } };
      } else {
        next = { id, question: q, answer: body as AgentAnswer };
      }
    } catch {
      next = { id, question: q, error: { code: "NETWORK" } };
    }
    setTurns((prev) => prev.map((x) => (x.id === id ? next : x)));
    inputRef.current?.focus();
  }

  const suggestions = isSuper ? SUGGESTIONS_SUPER : SUGGESTIONS_DEPT;

  return (
    <div className="flex flex-col">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        {isSuper ? (
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            {t("scopeLabel")}
            <select
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
              disabled={busy}
              className="h-10 max-w-[14rem] rounded-full border border-border bg-surface px-3 text-sm text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              <option value="">{t("scopeAll")}</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>{locale === "as" ? d.name_as : d.name_en}</option>
              ))}
            </select>
          </label>
        ) : (
          <span />
        )}
        {turns.length > 0 && (
          <Button variant="ghost" size="sm" onClick={() => setTurns([])} disabled={busy}>
            <RotateCcw strokeWidth={1.75} aria-hidden />
            {t("newChat")}
          </Button>
        )}
      </div>

      <div className="min-h-[40dvh] space-y-5" aria-live="polite">
        {turns.length === 0 && (
          <EmptyState
            icon={MessagesSquare}
            title={t("emptyTitle")}
            body={t("emptyBody")}
            action={
              <div className="flex flex-wrap justify-center gap-2">
                {suggestions.map((k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => ask(t(`suggestions.${k}`))}
                    className="rounded-full border border-border bg-surface px-3.5 py-2 text-left text-sm text-foreground shadow-sm transition-colors hover:border-border-strong hover:bg-surface-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  >
                    {t(`suggestions.${k}`)}
                  </button>
                ))}
              </div>
            }
          />
        )}

        {turns.map((turn) => (
          <div key={turn.id} className="space-y-3">
            <div className="flex justify-end">
              <p
                lang={isAssameseText(turn.question) ? "as" : "en"}
                className="max-w-[85%] rounded-2xl bg-primary px-4 py-2.5 text-[0.9375rem] whitespace-pre-line text-primary-foreground"
              >
                <span className="sr-only">{t("you")}: </span>
                {turn.question}
              </p>
            </div>
            <div className="max-w-full rounded-card border border-border bg-surface p-4 shadow-sm sm:max-w-[90%] sm:p-5">
              <p className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground">{t("assistant")}</p>
              {turn.pending && <Thinking />}
              {turn.error && (
                <div role="alert" className="flex flex-col items-start gap-3">
                  <p className="flex items-start gap-2 text-sm text-danger">
                    <AlertTriangle className="mt-0.5 size-4 shrink-0" strokeWidth={1.75} aria-hidden />
                    {errorText(turn.error)}
                  </p>
                  {turn.error.code !== "FORBIDDEN" && (
                    <Button variant="secondary" size="sm" onClick={() => ask(turn.question, turn.id)} disabled={busy}>
                      <RotateCw strokeWidth={1.75} aria-hidden />
                      {tu("retry")}
                    </Button>
                  )}
                </div>
              )}
              {turn.answer && (
                <>
                  <p lang={turn.answer.lang} className="text-[0.9375rem] leading-relaxed whitespace-pre-line">{turn.answer.answer}</p>
                  {turn.answer.chart && <Chart chart={turn.answer.chart} lang={turn.answer.lang} />}
                  <TraceList trace={turn.answer.trace} model={turn.answer.model} ms={turn.answer.ms} lang={turn.answer.lang} />
                </>
              )}
            </div>
          </div>
        ))}
        <div ref={endRef} className="scroll-mb-36" />
      </div>

      <form
        onSubmit={(e) => { e.preventDefault(); void ask(draft); }}
        className="sticky bottom-0 z-10 -mx-4 mt-6 bg-background px-4 pt-2 pb-[max(1rem,env(safe-area-inset-bottom))] sm:mx-0 sm:px-0"
      >
        <div className="flex items-end gap-2 rounded-[1.5rem] border border-border bg-surface p-1.5 pl-4 shadow-sm focus-within:border-border-strong">
          <label htmlFor="agent-q" className="sr-only">{t("inputLabel")}</label>
          <textarea
            id="agent-q"
            ref={inputRef}
            rows={1}
            maxLength={500}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void ask(draft); }
            }}
            placeholder={t("placeholder")}
            className="max-h-32 min-h-10 flex-1 resize-none bg-transparent py-2 text-[0.9375rem] leading-6 outline-none placeholder:text-subtle-foreground [field-sizing:content]"
          />
          <Button type="submit" size="icon" aria-label={t("send")} disabled={busy || draft.trim().length < 2}>
            <ArrowUp strokeWidth={1.75} aria-hidden />
          </Button>
        </div>
        <p className="mt-2 px-1 text-xs text-muted-foreground">{t("disclaimer")}</p>
      </form>
    </div>
  );
}
