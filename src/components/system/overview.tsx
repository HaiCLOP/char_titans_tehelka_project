"use client";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/components/api-client";
import { Card, CardHeader, EmptyState, ErrorState, Skeleton } from "@/components/ui";
import type { SysHealth } from "@/lib/sys";
import { cn } from "@/lib/utils";
import { KeyStatusText, Row, StatusText, useFmt } from "./shared";

// S20 — system overview. Polls /api/sys/health every 5 s.
export function SysOverview() {
  const t = useTranslations("sys.overview");
  const tc = useTranslations("sys.common");
  const f = useFmt();
  const q = useQuery({
    queryKey: ["sys", "health"],
    queryFn: () => apiFetch<SysHealth>("/api/sys/health"),
    refetchInterval: 5000,
    staleTime: 0,
  });

  if (q.isPending) {
    return (
      <div className="grid gap-4 md:grid-cols-2" aria-busy>
        <span className="sr-only">{tc("autoRefresh")}</span>
        {Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-40 rounded-card" />)}
      </div>
    );
  }
  if (q.isError) return <ErrorState body={tc("loadError")} onRetry={() => q.refetch()} retrying={q.isFetching} />;

  const h = q.data;
  const e = h.engine;
  const engineLine = e.state === "online" ? t("engineOnline") : e.state === "offline" ? t("engineOffline") : t("engineDisabled");
  const uptime = e.state === "online" ? t("uptimeValue", { h: f.n(Math.floor(e.uptimeS / 3600)), m: f.n(Math.floor((e.uptimeS % 3600) / 60)) }) : "";
  const breakers = [...(e.state === "online" ? e.openBreakers : []), ...h.web.openBreakers];

  return (
    <div className="space-y-6">
      <p className="text-xs text-muted-foreground" aria-live="polite">
        {tc("autoRefresh")} · {tc("updated", { time: f.time(h.generatedAt) })}
      </p>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader as="h2" title={t("engine")} />
          <p className={cn("text-sm font-medium", e.state === "online" ? "text-success" : "text-warning")}>
            <span className={cn("mr-2 inline-block size-2 rounded-full align-middle", e.state === "online" ? "bg-success" : "bg-warning")} aria-hidden />
            {engineLine}
          </p>
          {e.state === "online" && (
            <dl className="mt-3 divide-y divide-border">
              <Row label={t("version")}>{e.version}</Row>
              <Row label={t("uptime")}>{uptime}</Row>
              <Row label={t("database")}>
                <span className={e.dbConnected ? "text-success" : "text-danger"}>{e.dbConnected ? t("dbConnected") : t("dbDown")}</span>
              </Row>
              <Row label={t("configLoaded")}>{f.time(e.configLoadedAt)}</Row>
              {e.droppedLogs !== null && <Row label={t("droppedLogs")}>{f.n(e.droppedLogs)}</Row>}
              {e.workers.length > 0 && <Row label={t("workers")}>{e.workers.join(", ")}</Row>}
            </dl>
          )}
        </Card>
        <Card>
          <CardHeader as="h2" title={t("webRouter")} />
          <dl className="divide-y divide-border">
            <Row label={t("configLoaded")}>{f.time(h.web.loadedAt)}</Row>
            <Row label={t("breakers")}>
              {breakers.length === 0 ? (
                tc("none")
              ) : (
                <ul className="space-y-0.5 text-danger">
                  {breakers.map((b) => <li key={b.model + b.openUntil}>{t("breakerUntil", { model: b.model, time: f.time(b.openUntil) })}</li>)}
                </ul>
              )}
            </Row>
          </dl>
        </Card>
      </div>

      <section>
        <h2 className="text-title text-lg">{t("keys")}</h2>
        {h.keys.length === 0 ? (
          <EmptyState className="mt-3" title={t("keysEmpty")} />
        ) : (
          <ul className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {h.keys.map((k) => (
              <li key={k.label} className="rounded-card border border-border bg-surface p-4">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="min-w-0 truncate font-medium">{k.label}</span>
                  <span className="text-xs text-muted-foreground">{k.provider} · …{k.last4}</span>
                </div>
                <KeyStatusText k={k} className="mt-1 block text-sm" />
                <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
                  <Stat label={t("callsMin")} value={`${f.n(k.callsLastMinute)}/${f.n(k.rpm)}`} />
                  <Stat label={t("okHour")} value={f.n(k.okLastHour)} />
                  <Stat label={t("failsHour")} value={f.n(k.failsLastHour)} tone={k.failsLastHour > 0 ? "text-danger" : undefined} />
                </dl>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="text-title text-lg">{t("models")}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t("modelsHint")}</p>
        {h.models.length === 0 ? (
          <EmptyState className="mt-3" title={t("modelsEmpty")} />
        ) : (
          <ul className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {h.models.map((m) => (
              <li key={`${m.purpose}|${m.provider}|${m.model}`} className="flex flex-col rounded-card border border-border bg-surface p-4">
                <p className="eyebrow">{m.purpose}</p>
                <p className="mt-1 font-mono text-[0.8125rem] break-all">{m.provider}/{m.model}</p>
                {m.calls === 0 ? (
                  <p className="mt-3 text-sm text-muted-foreground">{t("noTraffic")}</p>
                ) : (
                  <>
                    <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
                      <Stat
                        label={t("success")}
                        value={f.pct(m.successRate)}
                        tone={m.successRate !== null && m.successRate < 0.8 ? "text-danger" : "text-success"}
                      />
                      <Stat label={t("p50")} value={f.ms(m.p50)} />
                      <Stat label={t("p95")} value={f.ms(m.p95)} />
                    </dl>
                    <p className="mt-2 text-xs text-muted-foreground">{t("calls", { n: f.n(m.calls) })}</p>
                    <div className="mt-3 border-t border-border pt-2 text-xs">
                      {m.lastError ? (
                        <>
                          <p>
                            <span className="text-muted-foreground">{t("lastError")} · {f.time(m.lastError.at)} · </span>
                            <StatusText status={m.lastError.status} />
                          </p>
                          {m.lastError.error && <p className="mt-0.5 line-clamp-2 break-words text-muted-foreground">{m.lastError.error}</p>}
                        </>
                      ) : (
                        <p className="text-muted-foreground">{t("noErrors")}</p>
                      )}
                    </div>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="flex min-w-0 flex-col-reverse rounded-xl bg-surface-muted px-1.5 py-2">
      <dt className="mt-0.5 truncate text-[0.6875rem] text-muted-foreground">{label}</dt>
      <dd className={cn("tabular text-base font-semibold", tone)}>{value}</dd>
    </div>
  );
}
