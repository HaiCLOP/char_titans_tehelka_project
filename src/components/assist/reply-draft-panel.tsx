"use client";
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { PenLine, RotateCw, SendHorizontal } from "lucide-react";
import { MESSAGE_MAX, type ReplyDraft } from "@/lib/assist/types";
import { cn } from "@/lib/utils";
import { Button, Card, CardHeader, Skeleton, Textarea } from "@/components/ui";
import { apiFetch, isApiError } from "@/components/api-client";
import { useSendMessage } from "@/components/chat/ticket-chat";

type ReplyDraftPanelProps = {
  complaintId: string;
  /** Called after the edited draft was sent as a chat message. */
  onSent?: () => void;
  className?: string;
};

/** S15 rail: AI drafts a reply in the reporter's language → admin edits → sent as a chat message. */
export function ReplyDraftPanel({ complaintId, onSent, className }: ReplyDraftPanelProps) {
  const t = useTranslations("assist.reply");
  const tc = useTranslations("chat");
  const [text, setText] = useState<string | null>(null);
  const [lang, setLang] = useState<"en" | "as">("en");

  const draft = useMutation({
    mutationFn: () => apiFetch<ReplyDraft>(`/api/complaints/${encodeURIComponent(complaintId)}/reply-draft`, { method: "POST" }),
    onSuccess: (d) => {
      setText(d.text);
      setLang(d.lang);
    },
  });
  const send = useSendMessage(complaintId);

  const sendIt = () => {
    const body = text?.trim();
    if (!body) return;
    send.mutate(body, {
      onSuccess: () => {
        toast.success(t("sent"));
        setText(null);
        draft.reset();
        onSent?.();
      },
      onError: (e) => toast.error(isApiError(e, "RATE_LIMITED") ? tc("rateLimited") : tc("sendFailed")),
    });
  };

  return (
    <Card className={cn("min-w-0", className)}>
      <CardHeader as="h3" title={t("title")} description={t("description")} className="mb-4" />

      {draft.isPending ? (
        <div className="space-y-2" role="status" aria-label={t("generating")}>
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-11/12" />
          <Skeleton className="h-4 w-2/3" />
          <p className="pt-1 text-xs text-muted-foreground">{t("generating")}</p>
        </div>
      ) : text !== null ? (
        <div className="space-y-3">
          <Textarea
            id={`reply-${complaintId}`}
            label={t("editLabel")}
            hint={t("written", { lang: t(`lang.${lang}`) })}
            lang={lang}
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={MESSAGE_MAX}
            showCount
            rows={6}
          />
          <p className="text-xs text-muted-foreground">{t("review")}</p>
          <div className="flex flex-wrap gap-2">
            <Button onClick={sendIt} loading={send.isPending} disabled={!text.trim()}>
              {!send.isPending && <SendHorizontal strokeWidth={1.75} aria-hidden />}
              {t("send")}
            </Button>
            <Button variant="secondary" onClick={() => draft.mutate()} disabled={send.isPending}>
              <RotateCw strokeWidth={1.75} aria-hidden />
              {t("regenerate")}
            </Button>
            <Button variant="ghost" onClick={() => setText(null)} disabled={send.isPending}>
              {t("discard")}
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {draft.isError && (
            <p role="alert" className="text-sm text-danger">
              {t("failed")}
            </p>
          )}
          <Button variant="secondary" onClick={() => draft.mutate()} block>
            {draft.isError ? <RotateCw strokeWidth={1.75} aria-hidden /> : <PenLine strokeWidth={1.75} aria-hidden />}
            {t("generate")}
          </Button>
        </div>
      )}
    </Card>
  );
}
