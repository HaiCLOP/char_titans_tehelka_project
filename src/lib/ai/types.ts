export const AI_PURPOSES = [
  "intake", "embed", "dedup_verify", "agent", "reply_draft", "translate_msg", "resolution_check", "daily_brief", "media_extract",
] as const;
export type AIPurpose = (typeof AI_PURPOSES)[number];

export const PURPOSE_TIMEOUT_MS: Record<AIPurpose, number> = {
  intake: 15_000, embed: 5_000, dedup_verify: 6_000, agent: 25_000,
  reply_draft: 10_000, translate_msg: 6_000, resolution_check: 15_000, daily_brief: 20_000, media_extract: 60_000,
};

export type ModelEntry = { provider: string; model: string; caps: string[] };
export type AttemptStatus = "ok" | "rate_limited" | "error" | "timeout" | "invalid" | "skipped";
export type Attempt = { provider: string; model: string; keyLabel: string; status: AttemptStatus; latencyMs: number; error?: string };
