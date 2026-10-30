import "server-only";

// Discovers OpenRouter's currently-free models (ids ending ":free") at runtime, cached 1 h.
// Free models change often, so we never hardcode them. Paid models are refused by the router.
type ORModel = { id: string; architecture?: { input_modalities?: string[] }; supported_parameters?: string[]; context_length?: number };
const g = globalThis as { __orFree?: { at: number; models: ORModel[] } };

export const isFreeOpenRouterModel = (id: string) => id.endsWith(":free");

export async function listFreeModels(caps: string[] = []): Promise<string[]> {
  if (!g.__orFree || Date.now() - g.__orFree.at > 3_600_000) {
    try {
      const res = await fetch("https://openrouter.ai/api/v1/models", { signal: AbortSignal.timeout(5000) });
      const json = (await res.json()) as { data: ORModel[] };
      g.__orFree = { at: Date.now(), models: json.data.filter((m) => isFreeOpenRouterModel(m.id)) };
    } catch {
      return g.__orFree?.models.map((m) => m.id) ?? [];
    }
  }
  return g.__orFree.models
    .filter((m) => !caps.includes("vision") || (m.architecture?.input_modalities ?? []).includes("image"))
    .filter((m) => !caps.includes("tools") || (m.supported_parameters ?? []).includes("tools"))
    .filter((m) => !caps.includes("json") || (m.supported_parameters ?? []).some((p) => p === "structured_outputs" || p === "response_format"))
    .sort((a, b) => (b.context_length ?? 0) - (a.context_length ?? 0))
    .slice(0, 3)
    .map((m) => m.id);
}
