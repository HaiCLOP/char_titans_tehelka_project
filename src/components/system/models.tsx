"use client";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { ArrowDown, ArrowUp, FlaskConical, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { apiFetch, isApiError } from "@/components/api-client";
import { Button, Card, Dialog, ErrorState, Input, Select, Skeleton } from "@/components/ui";
import type { PurposeTest } from "@/lib/ai/sys-test";
import type { Chain, ChainModel } from "@/lib/sys";
import { cn } from "@/lib/utils";
import { AttemptList, useChangeToast, useFmt } from "./shared";

type ChainsResponse = { chains: Chain[]; engine?: boolean | null };

// S22 — model chain per purpose: reorder, enable/disable, add (free-only OpenRouter), remove, test.
export function SysModels() {
  const tc = useTranslations("sys.common");
  const q = useQuery({ queryKey: ["sys", "models"], queryFn: () => apiFetch<ChainsResponse>("/api/sys/models"), staleTime: 0 });
  if (q.isPending) {
    return (
      <div className="grid gap-4 lg:grid-cols-2" aria-busy>
        {Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-56 rounded-card" />)}
      </div>
    );
  }
  if (q.isError) return <ErrorState body={tc("loadError")} onRetry={() => q.refetch()} retrying={q.isFetching} />;
  return (
    <div className="grid items-start gap-4 lg:grid-cols-2">
      {q.data.chains.map((c) => <ChainCard key={c.purpose} chain={c} />)}
    </div>
  );
}

function ChainCard({ chain }: { chain: Chain }) {
  const t = useTranslations("sys.models");
  const tc = useTranslations("sys.common");
  const f = useFmt();
  const qc = useQueryClient();
  const changed = useChangeToast();
  const [adding, setAdding] = useState(false);
  const [confirm, setConfirm] = useState<ChainModel | null>(null);
  const [result, setResult] = useState<PurposeTest | null>(null);

  const apply = (res: ChainsResponse, message?: string) => {
    qc.setQueryData(["sys", "models"], { chains: res.chains });
    void qc.invalidateQueries({ queryKey: ["sys", "health"] });
    changed(message ?? tc("saved"), res);
  };
  const onError = (e: unknown) => toast.error(isApiError(e) ? e.message : tc("failed"));

  const patch = useMutation({
    mutationFn: (body: { id: string; enabled: boolean } | { id: string; move: "up" | "down" }) =>
      apiFetch<ChainsResponse>("/api/sys/models", { method: "PATCH", json: body }),
    onSuccess: (res) => apply(res),
    onError,
  });
  const remove = useMutation({
    mutationFn: (id: string) => apiFetch<ChainsResponse>(`/api/sys/models?id=${encodeURIComponent(id)}`, { method: "DELETE" }),
    onSuccess: (res) => { apply(res, t("removed")); setConfirm(null); },
    onError,
  });
  const test = useMutation({
    mutationFn: () => apiFetch<PurposeTest>("/api/sys/test", { method: "POST", json: { purpose: chain.purpose } }),
    onSuccess: setResult,
    onError,
  });
  const busy = patch.isPending || remove.isPending;

  return (
    <Card className="p-5 sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-title font-mono text-base">{chain.purpose}</h2>
        <div className="flex gap-1.5">
          <Button size="sm" variant="secondary" onClick={() => test.mutate()} loading={test.isPending} title={t("testHint")}>
            {!test.isPending && <FlaskConical strokeWidth={1.75} aria-hidden />}
            {t("test")}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setAdding((v) => !v)} aria-expanded={adding}>
            <Plus strokeWidth={1.75} aria-hidden />
            {t("add")}
          </Button>
        </div>
      </div>

      {chain.models.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">{t("emptyChain")}</p>
      ) : (
        <ol className="mt-3 divide-y divide-border">
          {chain.models.map((m, i) => (
            <li key={m.id} className={cn("flex items-center gap-2 py-2.5", !m.enabled && "opacity-55")}>
              <span className="tabular w-5 shrink-0 text-sm text-muted-foreground">{f.n(i + 1)}</span>
              <div className="min-w-0 flex-1">
                <p className="font-mono text-[0.8125rem] break-all">{m.provider}/{m.model}</p>
                {m.model === "auto:free" && <p className="text-xs text-muted-foreground">{t("auto")}</p>}
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={m.enabled}
                aria-label={`${t("enabled")} — ${m.model}`}
                disabled={busy}
                onClick={() => patch.mutate({ id: m.id, enabled: !m.enabled })}
                className={cn(
                  "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40",
                  m.enabled ? "bg-primary" : "bg-border-strong",
                )}
              >
                <span aria-hidden className={cn("inline-block size-5 rounded-full bg-surface shadow-sm transition-transform", m.enabled ? "translate-x-5" : "translate-x-0.5")} />
              </button>
              <Button size="icon-sm" variant="ghost" aria-label={t("moveUp", { model: m.model })} disabled={busy || i === 0} onClick={() => patch.mutate({ id: m.id, move: "up" })}>
                <ArrowUp strokeWidth={1.75} aria-hidden />
              </Button>
              <Button size="icon-sm" variant="ghost" aria-label={t("moveDown", { model: m.model })} disabled={busy || i === chain.models.length - 1} onClick={() => patch.mutate({ id: m.id, move: "down" })}>
                <ArrowDown strokeWidth={1.75} aria-hidden />
              </Button>
              <Button size="icon-sm" variant="ghost" aria-label={`${t("remove")} — ${m.model}`} disabled={busy} onClick={() => setConfirm(m)}>
                <Trash2 strokeWidth={1.75} aria-hidden />
              </Button>
            </li>
          ))}
        </ol>
      )}

      {adding && <AddModelForm purpose={chain.purpose} onAdded={(res) => { apply(res, t("added")); setAdding(false); }} onCancel={() => setAdding(false)} />}

      {result && (
        <div className="mt-4 border-t border-border pt-4" aria-live="polite">
          {result.ok ? (
            <>
              <p className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                <span className="font-medium text-success">{t("output")}</span>
                <span className="tabular text-muted-foreground">{result.model} · {f.ms(result.ms)}</span>
              </p>
              <p className="mt-1.5 rounded-xl bg-surface-muted px-3 py-2 text-sm leading-relaxed">{result.output}</p>
              {result.bengaliDrift && <p className="mt-1.5 text-xs font-medium text-danger">{t("drift")}</p>}
            </>
          ) : (
            <p className="text-sm font-medium text-danger">{t("allFailed")} · {f.ms(result.ms)}</p>
          )}
          {result.attempts.length > 0 && (
            <>
              <p className="eyebrow mt-3">{t("attempts")}</p>
              <AttemptList attempts={result.attempts} />
            </>
          )}
        </div>
      )}

      <Dialog
        open={confirm !== null}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={t("remove")}
        description={confirm ? t("confirmRemove", { model: confirm.model, purpose: chain.purpose }) : undefined}
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirm(null)}>{tc("cancel")}</Button>
            <Button variant="danger" loading={remove.isPending} onClick={() => confirm && remove.mutate(confirm.id)}>{t("remove")}</Button>
          </>
        }
      />
    </Card>
  );
}

function AddModelForm({ purpose, onAdded, onCancel }: { purpose: string; onAdded: (res: ChainsResponse) => void; onCancel: () => void }) {
  const t = useTranslations("sys.models");
  const tc = useTranslations("sys.common");
  const [provider, setProvider] = useState<"google" | "openrouter">("google");
  const [model, setModel] = useState("");
  const [error, setError] = useState<string | null>(null);
  const add = useMutation({
    mutationFn: () => apiFetch<ChainsResponse>("/api/sys/models", { method: "POST", json: { purpose, provider, model } }),
    onSuccess: onAdded,
    onError: (e) => setError(isApiError(e) ? e.message : tc("failed")),
  });
  return (
    <form
      className="mt-4 grid gap-3 border-t border-border pt-4 sm:grid-cols-[10rem_1fr]"
      onSubmit={(e) => { e.preventDefault(); setError(null); add.mutate(); }}
    >
      <Select
        label={t("provider")}
        value={provider}
        onChange={(e) => setProvider(e.target.value as "google" | "openrouter")}
        options={[{ value: "google", label: "Google Gemini" }, { value: "openrouter", label: "OpenRouter" }]}
      />
      <Input
        label={t("model")} hint={t("modelHint")} value={model} onChange={(e) => setModel(e.target.value)}
        required minLength={3} maxLength={120} autoComplete="off" spellCheck={false} error={error ?? undefined}
        placeholder={provider === "google" ? "gemini-flash-lite-latest" : "auto:free"}
      />
      <div className="flex gap-2 sm:col-span-2">
        <Button type="submit" size="sm" loading={add.isPending}>{t("addSubmit")}</Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>{tc("cancel")}</Button>
      </div>
    </form>
  );
}
