"use client";
import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { Languages, MessagesSquare, SendHorizontal } from "lucide-react";
import { MESSAGE_MAX, type ChatMessage, type ChatThread } from "@/lib/assist/types";
import { cn } from "@/lib/utils";
import { Button, Card, CardHeader, EmptyState, ErrorState, RelativeTime, Skeleton } from "@/components/ui";
import { apiFetch, isApiError } from "@/components/api-client";
import { useRealtime } from "@/components/use-realtime";

export const chatQueryKey = (complaintId: string) => ["complaint-messages", complaintId] as const;

/** Sends one chat message and refreshes the thread. Shared by the composer and the AI reply draft panel. */
export function useSendMessage(complaintId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: string) =>
      apiFetch<ChatMessage>(`/api/complaints/${encodeURIComponent(complaintId)}/messages`, { method: "POST", json: { body } }),
    onSuccess: (m) => {
      qc.setQueryData<ChatThread>(chatQueryKey(complaintId), (d) =>
        d ? { ...d, items: d.items.some((x) => x.id === m.id) ? d.items.map((x) => (x.id === m.id ? m : x)) : [...d.items, m] } : d,
      );
      void qc.invalidateQueries({ queryKey: chatQueryKey(complaintId) });
    },
  });
}

function Bubble({ m }: { m: ChatMessage }) {
  const t = useTranslations("chat");
  const locale = useLocale();
  const reader = locale === "as" ? "as" : "en";
  const needsTranslation = m.lang !== reader;
  const [original, setOriginal] = useState(false);
  const translated = needsTranslation && m.body_translated && !original;
  const text = translated ? m.body_translated! : m.body;
  const textLang = translated ? reader : m.lang;
  const own = m.sender === "you";
  // A message without a translation that just arrived is probably still being translated.
  const [recent] = useState(() => Date.now() - new Date(m.created_at).getTime() < 30_000);

  return (
    <li className={cn("flex flex-col gap-1", own ? "items-end" : "items-start")}>
      <div className="flex max-w-full items-baseline gap-1.5 px-1 text-xs text-muted-foreground">
        <span className="font-medium text-foreground">{t(m.sender)}</span>
        {m.sender_name && <span className="truncate">· {m.sender_name}</span>}
        <span aria-hidden>·</span>
        <RelativeTime date={m.created_at} />
      </div>
      <p
        lang={textLang}
        className={cn(
          "max-w-[85%] rounded-2xl px-3.5 py-2 text-sm whitespace-pre-wrap break-words sm:max-w-[75%]",
          own ? "bg-primary text-primary-foreground" : "bg-surface-muted text-foreground",
        )}
      >
        {text}
      </p>
      {needsTranslation && (
        <div className="flex flex-wrap items-center gap-x-2 px-1 text-xs text-muted-foreground">
          {m.body_translated ? (
            <>
              {translated && <span>{t("translatedFrom", { lang: t(`lang.${m.lang}`) })}</span>}
              <button
                type="button"
                onClick={() => setOriginal((v) => !v)}
                aria-pressed={original}
                className="inline-flex items-center gap-1 rounded-full font-medium underline-offset-2 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Languages className="size-3.5" strokeWidth={1.75} aria-hidden />
                {original ? t("showTranslation") : t("showOriginal")}
              </button>
            </>
          ) : (
            <span>{recent ? t("translating") : t("notTranslated")}</span>
          )}
        </div>
      )}
    </li>
  );
}

function ChatSkeleton() {
  return (
    <div className="space-y-4" aria-hidden>
      <Skeleton className="h-10 w-2/3 rounded-2xl" />
      <Skeleton className="ml-auto h-10 w-1/2 rounded-2xl" />
      <Skeleton className="h-14 w-3/4 rounded-2xl" />
    </div>
  );
}

type TicketChatProps = {
  complaintId: string;
  /** Subscribe to realtime changes (owner / staff of the ticket — Realtime follows RLS). Default true. */
  live?: boolean;
  className?: string;
};

/**
 * S08/S15 bilingual chat. Each message shows in the reader's language with an "original" toggle.
 * The thread scrolls inside the card; the composer stays visible below it.
 */
export function TicketChat({ complaintId, live = true, className }: TicketChatProps) {
  const t = useTranslations("chat");
  const qc = useQueryClient();
  const key = chatQueryKey(complaintId);
  const listRef = useRef<HTMLOListElement>(null);
  const [draft, setDraft] = useState("");

  const query = useQuery({
    queryKey: key,
    queryFn: ({ signal }) => apiFetch<ChatThread>(`/api/complaints/${encodeURIComponent(complaintId)}/messages`, { signal }),
    staleTime: 10_000,
    retry: (count, e) => !isApiError(e, "NOT_FOUND") && !isApiError(e, "FORBIDDEN") && count < 2,
    refetchInterval: live ? false : 20_000,
  });

  // INSERT = a new message; UPDATE = its translation arrived. Refetch: labels/names are computed server-side.
  useRealtime(
    `chat-${complaintId}`,
    [{ table: "messages", filter: `complaint_id=eq.${complaintId}`, event: "*" }],
    () => void qc.invalidateQueries({ queryKey: key }),
    live,
  );

  const send = useSendMessage(complaintId);
  const count = query.data?.items.length ?? 0;

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [count]);

  const submit = () => {
    const body = draft.trim();
    if (!body || send.isPending) return;
    send.mutate(body, {
      onSuccess: () => setDraft(""),
      onError: (e) => toast.error(isApiError(e, "RATE_LIMITED") ? t("rateLimited") : t("sendFailed")),
    });
  };

  if (query.isError && (isApiError(query.error, "NOT_FOUND") || isApiError(query.error, "FORBIDDEN"))) return null;

  return (
    <Card className={cn("flex min-w-0 flex-col", className)}>
      <CardHeader title={t("title")} description={t("description")} className="mb-4" />

      {query.isPending ? (
        <ChatSkeleton />
      ) : query.isError ? (
        <ErrorState bare title={t("loadFailed")} onRetry={() => void query.refetch()} retrying={query.isFetching} className="py-6" />
      ) : count === 0 ? (
        <EmptyState bare icon={MessagesSquare} title={t("empty.title")} body={t("empty.body")} className="py-6" />
      ) : (
        <ol
          ref={listRef}
          aria-label={t("title")}
          aria-live="polite"
          className="-mx-1 max-h-[26rem] space-y-4 overflow-y-auto overscroll-contain px-1 py-1"
        >
          {query.data.items.map((m) => (
            <Bubble key={m.id} m={m} />
          ))}
        </ol>
      )}

      {query.data?.can_post !== false && !query.isError && (
        <form
          className="mt-4 border-t border-border pt-4"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <label htmlFor={`chat-${complaintId}`} className="sr-only">
            {t("composerLabel")}
          </label>
          <div className="flex items-end gap-2">
            <textarea
              id={`chat-${complaintId}`}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  submit();
                }
              }}
              rows={2}
              maxLength={MESSAGE_MAX}
              placeholder={t("placeholder")}
              aria-describedby={`chat-${complaintId}-hint`}
              className="min-h-11 min-w-0 flex-1 resize-none rounded-2xl border border-border bg-surface px-3.5 py-2.5 text-sm leading-relaxed placeholder:text-subtle-foreground focus-visible:border-border-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <Button type="submit" size="icon" loading={send.isPending} disabled={!draft.trim()} aria-label={t("send")}>
              {!send.isPending && <SendHorizontal strokeWidth={1.75} aria-hidden />}
            </Button>
          </div>
          <p id={`chat-${complaintId}-hint`} className="mt-1.5 hidden px-1 text-xs text-muted-foreground sm:block">
            {t("hint")}
          </p>
        </form>
      )}
    </Card>
  );
}
