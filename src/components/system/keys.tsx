"use client";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { FlaskConical, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { apiFetch, isApiError } from "@/components/api-client";
import { Button, Card, CardHeader, Dialog, EmptyState, ErrorState, Input, Select, Skeleton } from "@/components/ui";
import type { KeyProbe } from "@/lib/ai/router";
import type { KeyRowOut } from "@/lib/sys";
import { cn } from "@/lib/utils";
import { KeyStatusText, StatusText, useChangeToast, useFmt } from "./shared";

type KeysResponse = { keys: KeyRowOut[]; engine: string };
type Change = { engine?: boolean | null };

/** Compact role="switch" for table cells (the visible column header names it; aria-label repeats it). */
function Toggle({ checked, onChange, label, disabled, tone = "primary" }: {
  checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean; tone?: "primary" | "warning";
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-40",
        checked ? (tone === "warning" ? "bg-warning" : "bg-primary") : "bg-border-strong",
      )}
    >
      <span aria-hidden className={cn("inline-block size-5 rounded-full bg-surface shadow-sm transition-transform", checked ? "translate-x-5" : "translate-x-0.5")} />
    </button>
  );
}

// S21 — keys: list, add (encrypted server-side), enable/disable, simulate failure, delete, test all.
export function SysKeys() {
  const t = useTranslations("sys.keys");
  const tc = useTranslations("sys.common");
  const f = useFmt();
  const qc = useQueryClient();
  const changed = useChangeToast();
  const [adding, setAdding] = useState(false);
  const [confirm, setConfirm] = useState<KeyRowOut | null>(null);
  const [results, setResults] = useState<KeyProbe[] | null>(null);

  const q = useQuery({
    queryKey: ["sys", "keys"],
    queryFn: () => apiFetch<KeysResponse>("/api/sys/keys"),
    refetchInterval: 5000,
    staleTime: 0,
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ["sys"] });
  const onError = (e: unknown) => toast.error(isApiError(e) ? e.message : tc("failed"));

  const patch = useMutation({
    mutationFn: (body: { id: string; enabled?: boolean; simulate_failure?: boolean }) =>
      apiFetch<Change>("/api/sys/keys", { method: "PATCH", json: body }),
    onSuccess: (res, body) => {
      const label = q.data?.keys.find((k) => k.id === body.id)?.label ?? "";
      changed(body.simulate_failure === undefined ? tc("saved") : t(body.simulate_failure ? "simulateOn" : "simulateOff", { label }), res);
      void refresh();
    },
    onError,
  });
  const remove = useMutation({
    mutationFn: (id: string) => apiFetch<Change>(`/api/sys/keys?id=${encodeURIComponent(id)}`, { method: "DELETE" }),
    onSuccess: (res) => { changed(t("deleted"), res); setConfirm(null); void refresh(); },
    onError,
  });
  const test = useMutation({
    mutationFn: () => apiFetch<{ results: KeyProbe[] }>("/api/sys/keys/test", { method: "POST" }),
    onSuccess: (res) => { setResults(res.results); void refresh(); },
    onError,
  });

  if (q.isPending) return <Skeleton className="h-64 rounded-card" />;
  if (q.isError) return <ErrorState body={tc("loadError")} onRetry={() => q.refetch()} retrying={q.isFetching} />;
  const keys = q.data.keys;
  const busy = (id: string | null) => patch.isPending && patch.variables?.id === id;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => setAdding((v) => !v)} aria-expanded={adding}>
          <Plus strokeWidth={1.75} aria-hidden />
          {t("add")}
        </Button>
        <Button variant="secondary" onClick={() => test.mutate()} loading={test.isPending} disabled={keys.length === 0}>
          {!test.isPending && <FlaskConical strokeWidth={1.75} aria-hidden />}
          {t("testAll")}
        </Button>
      </div>

      {adding && <AddKeyForm onDone={() => { setAdding(false); void refresh(); }} />}

      {results && (
        <Card>
          <CardHeader as="h2" title={t("testTitle")} description={t("testHint")} />
          <ul className="divide-y divide-border text-sm">
            {results.map((r) => (
              <li key={r.label} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 py-2">
                <span className="font-medium">{r.label}</span>
                <span className="font-mono text-[0.8125rem] text-muted-foreground break-all">{r.model ?? tc("dash")}</span>
                <StatusText status={r.status} />
                <span className="tabular ml-auto text-muted-foreground">{f.ms(r.latencyMs)}</span>
                {r.error && <p className="w-full text-xs break-words text-muted-foreground">{r.error}</p>}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {keys.length === 0 ? (
        <EmptyState title={t("empty")} body={t("emptyBody")} />
      ) : (
        <>
          {/* md+: table */}
          <div className="hidden overflow-hidden rounded-card border border-border bg-surface md:block">
            <table className="w-full text-left text-sm">
              <thead className="text-xs text-muted-foreground">
                <tr className="border-b border-border">
                  <th className="px-4 py-3 font-medium">{t("colLabel")}</th>
                  <th className="px-4 py-3 font-medium">{t("colProvider")}</th>
                  <th className="px-4 py-3 font-medium">{t("colLast4")}</th>
                  <th className="px-4 py-3 font-medium">{t("colRpm")}</th>
                  <th className="px-4 py-3 font-medium">{t("colStatus")}</th>
                  <th className="px-4 py-3 font-medium">{t("enabled")}</th>
                  <th className="px-4 py-3 font-medium">{t("simulate")}</th>
                  <th className="px-4 py-3"><span className="sr-only">{t("colActions")}</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {keys.map((k) => (
                  <tr key={k.label}>
                    <td className="px-4 py-3">
                      <span className="font-medium">{k.label}</span>
                      {k.source === "env" && <span className="ml-2 rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground" title={t("envHint")}>{t("env")}</span>}
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {t("usage", { calls: f.n(k.callsLastMinute), fails: f.n(k.failsLastHour) })}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{k.provider}</td>
                    <td className="px-4 py-3 font-mono text-[0.8125rem]">…{k.last4}</td>
                    <td className="px-4 py-3">{f.n(k.rpm)}</td>
                    <td className="px-4 py-3"><KeyStatusText k={k} /></td>
                    <td className="px-4 py-3">
                      {k.id ? (
                        <Toggle checked={k.enabled} label={`${t("enabled")} — ${k.label}`} disabled={busy(k.id)} onChange={(v) => patch.mutate({ id: k.id!, enabled: v })} />
                      ) : <span className="text-xs text-muted-foreground">{t("envHint")}</span>}
                    </td>
                    <td className="px-4 py-3">
                      {k.id && (
                        <Toggle tone="warning" checked={k.simulate} label={`${t("simulate")} — ${k.label}`} disabled={busy(k.id)} onChange={(v) => patch.mutate({ id: k.id!, simulate_failure: v })} />
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {k.id && (
                        <Button variant="ghost" size="icon-sm" aria-label={`${t("delete")} — ${k.label}`} onClick={() => setConfirm(k)}>
                          <Trash2 strokeWidth={1.75} aria-hidden />
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="border-t border-border px-4 py-3 text-xs text-muted-foreground">{t("simulateHint")}</p>
          </div>

          {/* < md: cards */}
          <ul className="space-y-3 md:hidden">
            {keys.map((k) => (
              <li key={k.label} className="rounded-card border border-border bg-surface p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium">
                      {k.label}
                      {k.source === "env" && <span className="ml-2 rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">{t("env")}</span>}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{k.provider} · …{k.last4} · {t("colRpm")} {f.n(k.rpm)}</p>
                  </div>
                  {k.id && (
                    <Button variant="ghost" size="icon-sm" aria-label={`${t("delete")} — ${k.label}`} onClick={() => setConfirm(k)}>
                      <Trash2 strokeWidth={1.75} aria-hidden />
                    </Button>
                  )}
                </div>
                <KeyStatusText k={k} className="mt-2 block text-sm" />
                <p className="mt-0.5 text-xs text-muted-foreground">{t("usage", { calls: f.n(k.callsLastMinute), fails: f.n(k.failsLastHour) })}</p>
                {k.id ? (
                  <div className="mt-3 space-y-2 border-t border-border pt-3 text-sm">
                    <label className="flex items-center justify-between gap-3">
                      <span>{t("enabled")}</span>
                      <Toggle checked={k.enabled} label={`${t("enabled")} — ${k.label}`} disabled={busy(k.id)} onChange={(v) => patch.mutate({ id: k.id!, enabled: v })} />
                    </label>
                    <label className="flex items-center justify-between gap-3">
                      <span>{t("simulate")}</span>
                      <Toggle tone="warning" checked={k.simulate} label={`${t("simulate")} — ${k.label}`} disabled={busy(k.id)} onChange={(v) => patch.mutate({ id: k.id!, simulate_failure: v })} />
                    </label>
                  </div>
                ) : (
                  <p className="mt-3 border-t border-border pt-3 text-xs text-muted-foreground">{t("envHint")}</p>
                )}
              </li>
            ))}
            <li className="px-1 text-xs text-muted-foreground">{t("simulateHint")}</li>
          </ul>
        </>
      )}

      <Dialog
        open={confirm !== null}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={t("delete")}
        description={confirm ? t("confirmDelete", { label: confirm.label }) : undefined}
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirm(null)}>{tc("cancel")}</Button>
            <Button variant="danger" loading={remove.isPending} onClick={() => confirm?.id && remove.mutate(confirm.id)}>{t("delete")}</Button>
          </>
        }
      />
    </div>
  );
}

function AddKeyForm({ onDone }: { onDone: () => void }) {
  const t = useTranslations("sys.keys");
  const tc = useTranslations("sys.common");
  const changed = useChangeToast();
  const [provider, setProvider] = useState<"google" | "openrouter">("google");
  const [label, setLabel] = useState("");
  const [key, setKey] = useState("");
  const [rpm, setRpm] = useState("10");
  const [error, setError] = useState<string | null>(null);
  const add = useMutation({
    mutationFn: () => apiFetch<Change>("/api/sys/keys", { method: "POST", json: { provider, label, key, rpm_limit: Number(rpm) } }),
    onSuccess: (res) => { changed(t("added"), res); setKey(""); onDone(); },
    onError: (e) => setError(isApiError(e) ? e.message : tc("failed")),
  });
  return (
    <Card>
      <CardHeader as="h2" title={t("addTitle")} />
      <form
        className="grid gap-4 sm:grid-cols-2"
        onSubmit={(e) => { e.preventDefault(); setError(null); add.mutate(); }}
      >
        <Select
          label={t("provider")}
          value={provider}
          onChange={(e) => setProvider(e.target.value as "google" | "openrouter")}
          options={[{ value: "google", label: "Google Gemini" }, { value: "openrouter", label: "OpenRouter" }]}
        />
        <Input label={t("label")} hint={t("labelHint")} value={label} onChange={(e) => setLabel(e.target.value)} required maxLength={40} autoComplete="off" />
        <Input
          label={t("key")} hint={t("keyHint")} type="password" value={key} onChange={(e) => setKey(e.target.value)}
          required minLength={20} maxLength={512} autoComplete="off" spellCheck={false}
        />
        <Input label={t("rpm")} type="number" inputMode="numeric" min={1} max={1000} value={rpm} onChange={(e) => setRpm(e.target.value)} required />
        {error && <p role="alert" className="text-sm font-medium text-danger sm:col-span-2">{error}</p>}
        <div className="flex flex-wrap gap-2 sm:col-span-2">
          <Button type="submit" loading={add.isPending}>{t("save")}</Button>
          <Button variant="ghost" onClick={onDone}>{tc("cancel")}</Button>
        </div>
      </form>
    </Card>
  );
}
