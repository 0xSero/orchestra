import type { Config, Provider, Model } from "@opencode-ai/sdk";

export type ModelCatalogEntry = {
  /** Full ID in provider/model format */
  full: string;
  providerID: string;
  modelID: string;
  name: string;
  status: Model["status"];
  capabilities: Model["capabilities"];
  limit: Model["limit"];
  cost: Model["cost"];
  providerSource: Provider["source"];
};

export function isFullModelID(value: string): boolean {
  return value.includes("/");
}

export function parseFullModelID(value: string): {
  providerID: string;
  modelID: string;
} {
  const [providerID, ...rest] = value.split("/");
  return { providerID, modelID: rest.join("/") };
}

export function fullModelID(providerID: string, modelID: string): string {
  return `${providerID}/${modelID}`;
}

export function flattenProviders(providers: Provider[]): ModelCatalogEntry[] {
  const out: ModelCatalogEntry[] = [];
  for (const provider of providers) {
    const models = provider.models ?? {};
    for (const [modelID, model] of Object.entries(models)) {
      out.push({
        full: fullModelID(provider.id, modelID),
        providerID: provider.id,
        modelID,
        name: (model as any).name ?? modelID,
        status: (model as any).status ?? "active",
        capabilities: (model as any).capabilities ?? {
          temperature: true,
          reasoning: false,
          attachment: false,
          toolcall: false,
          input: {
            text: true,
            audio: false,
            image: false,
            video: false,
            pdf: false,
          },
          output: {
            text: true,
            audio: false,
            image: false,
            video: false,
            pdf: false,
          },
        },
        limit: (model as any).limit ?? { context: 0, output: 0 },
        cost: (model as any).cost ?? {
          input: 0,
          output: 0,
          cache: { read: 0, write: 0 },
        },
        providerSource: provider.source,
      });
    }
  }
  return out;
}

export function filterProviders(
  providers: Provider[],
  scope: "configured" | "all",
): Provider[] {
  if (scope === "all") return providers;

  // Filter to only providers that are usable (have credentials or are explicitly configured).
  //
  // The SDK's Provider.source field tells us how the provider was registered:
  //   - "config": Explicitly configured in opencode.json
  //   - "custom": Custom provider (npm package, explicitly configured)
  //   - "env": Auto-detected from environment variables (e.g., ANTHROPIC_API_KEY)
  //   - "api": From SDK's built-in API catalog (may or may not have credentials)
  //
  // For "configured" scope, we include:
  //   - "config" and "custom" sources (explicitly configured)
  //   - "env" sources (have environment-based credentials)
  //   - "api" sources that have a `key` set (connected via /connect)
  // The "opencode" provider is special and always available.
  return providers.filter((p) => {
    if (p.id === "opencode") return true;

    // Include explicitly configured providers
    if (p.source === "config" || p.source === "custom") return true;

    // Include environment-detected providers (they have API keys set)
    if (p.source === "env") return true;

    // For API catalog providers, check if they have credentials set.
    // The SDK's Provider type has an optional `key` field that's populated when
    // credentials are available (set via /connect command which stores in auth.json).
    if (p.source === "api" && p.key) return true;

    return false;
  });
}

export function resolveModelRef(
  input: string,
  providers: Provider[],
):
  | { full: string; providerID: string; modelID: string }
  | { error: string; suggestions?: string[] } {
  const raw = input.trim();
  if (!raw) return { error: "Model is required." };

  const normalize = (s: string): string => s.trim().toLowerCase();
  const stripProviderPrefix = (modelID: string): string => {
    const idx = modelID.indexOf(":");
    return idx >= 0 ? modelID.slice(idx + 1) : modelID;
  };
  const stripVersionSuffix = (modelID: string): string => {
    // Common patterns: -20251101, -2025-11-01, -v2, etc. Keep it conservative.
    return modelID
      .replace(/-\d{8}$/i, "")
      .replace(/-\d{4}-\d{2}-\d{2}$/i, "")
      .replace(/-v\d+$/i, "");
  };
  const matchCandidate = (
    needleRaw: string,
    candidateRaw: string,
    candidateName?: string,
  ): boolean => {
    const needle = normalize(
      stripVersionSuffix(stripProviderPrefix(needleRaw)),
    );
    const cand = normalize(
      stripVersionSuffix(stripProviderPrefix(candidateRaw)),
    );
    if (!needle) return false;

    if (cand === needle) return true;
    if (cand.startsWith(`${needle}-`)) return true;
    if (cand.includes(needle)) return true;
    if (candidateName) {
      const n = normalize(candidateName);
      if (n.includes(needle)) return true;
    }
    return false;
  };
  type Match = {
    providerID: string;
    modelID: string;
    score: number;
    providerSource: Provider["source"];
  };
  const scoreMatch = (
    needleRaw: string,
    provider: Provider,
    candidateRaw: string,
    candidateName?: string,
  ): number | undefined => {
    if (!matchCandidate(needleRaw, candidateRaw, candidateName))
      return undefined;

    const needle = normalize(
      stripVersionSuffix(stripProviderPrefix(needleRaw)),
    );
    const cand = normalize(
      stripVersionSuffix(stripProviderPrefix(candidateRaw)),
    );
    let score = 0;

    // Prefer configured providers over API ones when possible.
    if (provider.source !== "api") score += 5;

    // Prefer closer matches.
    if (cand === needle) score += 50;
    else if (cand.startsWith(`${needle}-`)) score += 25;
    else if (cand.includes(needle)) score += 10;

    // Prefer non-thinking variants when multiple Claude-style matches exist.
    if (
      /\bthinking\b/i.test(candidateRaw) ||
      /\bthinking\b/i.test(candidateName ?? "")
    )
      score -= 10;
    if (
      /\breasoning\b/i.test(candidateRaw) ||
      /\breasoning\b/i.test(candidateName ?? "")
    )
      score -= 5;

    return score;
  };
  const providerRank = (source: Provider["source"]): number => {
    if (source === "config" || source === "custom") return 0;
    if (source === "env") return 1;
    return 2;
  };
  const pickBest = (
    matches: Match[],
  ): { providerID: string; modelID: string } | undefined => {
    if (matches.length === 0) return undefined;
    const sorted = [...matches].sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      const rank =
        providerRank(a.providerSource) - providerRank(b.providerSource);
      if (rank !== 0) return rank;
      const providerCmp = a.providerID.localeCompare(b.providerID);
      if (providerCmp !== 0) return providerCmp;
      return a.modelID.localeCompare(b.modelID);
    });
    return { providerID: sorted[0].providerID, modelID: sorted[0].modelID };
  };
  const suggest = (matches: Array<{ providerID: string; modelID: string }>) =>
    matches.map((m) => fullModelID(m.providerID, m.modelID)).slice(0, 20);

  if (isFullModelID(raw)) {
    const parsed = parseFullModelID(raw);
    const provider = providers.find((p) => p.id === parsed.providerID);

    // Exact match within provider - respect explicit provider specification.
    // When user explicitly specifies "anthropic/model", use anthropic even if it's an "api" provider.
    if (provider && parsed.modelID in (provider.models ?? {})) {
      return {
        full: raw,
        providerID: parsed.providerID,
        modelID: parsed.modelID,
      };
    }

    // Fuzzy match: prefer same provider if it exists; otherwise search across all providers.
    const pool = provider ? [provider] : providers;
    const matches: Match[] = [];
    for (const p of pool) {
      for (const [modelID, model] of Object.entries(p.models ?? {})) {
        const score = scoreMatch(
          parsed.modelID,
          p,
          modelID,
          (model as any)?.name,
        );
        if (typeof score === "number") {
          matches.push({
            providerID: p.id,
            modelID,
            score,
            providerSource: p.source,
          });
        }
      }
    }
    const best = pickBest(matches);
    if (best) {
      return {
        full: fullModelID(best.providerID, best.modelID),
        providerID: best.providerID,
        modelID: best.modelID,
      };
    }
    if (matches.length > 1) {
      return {
        error: `Model "${parsed.modelID}" matches multiple configured models. Use an exact provider/model ID.`,
        suggestions: suggest(matches),
      };
    }

    // If provider is missing or doesn't contain the model, provide helpful suggestions.
    if (!provider) {
      // Try searching all providers for fuzzy matches to give suggestions.
      const all: Array<{ providerID: string; modelID: string }> = [];
      for (const p of providers) {
        for (const [modelID, model] of Object.entries(p.models ?? {})) {
          if (matchCandidate(parsed.modelID, modelID, (model as any)?.name))
            all.push({ providerID: p.id, modelID });
        }
      }
      return {
        error: `Unknown provider "${parsed.providerID}".`,
        suggestions: all.length
          ? suggest(all)
          : providers.map((p) => p.id).slice(0, 20),
      };
    }

    // Provider exists but model doesn't.
    const exactSuggestions = Object.keys(provider.models ?? {})
      .slice(0, 20)
      .map((m) => fullModelID(provider.id, m));
    return {
      error: `Model "${parsed.modelID}" not found for provider "${provider.id}".`,
      suggestions: exactSuggestions,
    };
  }

  const matches: Array<{
    providerID: string;
    modelID: string;
    score: number;
    providerSource: Provider["source"];
  }> = [];
  for (const provider of providers) {
    if (provider.models && raw in provider.models) {
      matches.push({
        providerID: provider.id,
        modelID: raw,
        score: 50,
        providerSource: provider.source,
      });
    }
  }

  if (matches.length >= 1) {
    const best = pickBest(matches);
    if (best) {
      return {
        full: fullModelID(best.providerID, best.modelID),
        providerID: best.providerID,
        modelID: best.modelID,
      };
    }
  }

  // Fuzzy match (by substring / version stripping) across all providers.
  const fuzzy: Match[] = [];
  for (const provider of providers) {
    for (const [modelID, model] of Object.entries(provider.models ?? {})) {
      const score = scoreMatch(raw, provider, modelID, (model as any)?.name);
      if (typeof score === "number") {
        fuzzy.push({
          providerID: provider.id,
          modelID,
          score,
          providerSource: provider.source,
        });
      }
    }
  }
  const bestFuzzy = pickBest(fuzzy);
  if (bestFuzzy) {
    return {
      full: fullModelID(bestFuzzy.providerID, bestFuzzy.modelID),
      providerID: bestFuzzy.providerID,
      modelID: bestFuzzy.modelID,
    };
  }
  if (fuzzy.length > 1) {
    return {
      error: `Model "${raw}" matches multiple configured models. Use an exact provider/model ID.`,
      suggestions: suggest(fuzzy),
    };
  }

  return {
    error: `Model "${raw}" not found. Run task_list({ view: "models" }) to see available models.`,
  };
}

export function pickVisionModel(
  models: ModelCatalogEntry[],
): ModelCatalogEntry | undefined {
  const score = (m: ModelCatalogEntry): number => {
    let s = 0;
    if (m.status === "deprecated") s -= 50;
    if (m.capabilities.toolcall) s += 10;
    if (m.capabilities.attachment) s += 10;
    if (m.capabilities.input?.image) s += 100;
    if (/\bvision\b/i.test(m.name) || /\bvision\b/i.test(m.modelID)) s += 20;
    if (/\bglm\b/i.test(m.modelID) && /4\\.6v/i.test(m.modelID)) s += 15;
    s += Math.min(Math.floor((m.limit?.context ?? 0) / 32000), 10);
    return s;
  };

  const candidates = models
    .filter((m) => m.capabilities?.attachment || m.capabilities?.input?.image)
    .sort((a, b) => score(b) - score(a));
  return candidates[0];
}

export function pickFastModel(
  models: ModelCatalogEntry[],
): ModelCatalogEntry | undefined {
  const score = (m: ModelCatalogEntry): number => {
    let s = 0;
    if (m.status === "deprecated") s -= 50;
    if (m.capabilities.toolcall) s += 5;
    if (
      /(mini|small|flash|fast|haiku)/i.test(m.modelID) ||
      /(mini|small|flash|fast|haiku)/i.test(m.name)
    )
      s += 10;
    if ((m.cost?.input ?? 0) > 0) s -= Math.min(m.cost.input, 5);
    if ((m.limit?.context ?? 0) > 0)
      s += Math.min(Math.floor(m.limit.context / 64000), 3);
    return s;
  };
  return [...models].sort((a, b) => score(b) - score(a))[0];
}

export function pickDocsModel(
  models: ModelCatalogEntry[],
): ModelCatalogEntry | undefined {
  const score = (m: ModelCatalogEntry): number => {
    let s = 0;
    if (m.status === "deprecated") s -= 50;
    if (m.capabilities.toolcall) s += 10;
    if (m.capabilities.reasoning) s += 3;
    if (/minimax/i.test(m.modelID) || /minimax/i.test(m.name)) s += 8;
    if (/m2/i.test(m.modelID) || /m2/i.test(m.name)) s += 3;
    s += Math.min(Math.floor((m.limit?.context ?? 0) / 64000), 10);
    return s;
  };
  return [...models].sort((a, b) => score(b) - score(a))[0];
}

export async function fetchOpencodeConfig(
  client: any,
  directory: string,
): Promise<Config | undefined> {
  const res = await client.config
    .get({ query: { directory } })
    .catch(() => undefined);
  return res?.data as Config | undefined;
}

export async function fetchProviders(
  client: any,
  directory: string,
): Promise<{ providers: Provider[]; defaults: Record<string, string> }> {
  // Use provider.list() to get ALL providers including API catalog (zhipuai-coding-plan, etc.)
  // Fall back to config.providers() if provider.list() is unavailable
  const [providerListRes, configProvidersRes] = await Promise.all([
    client.provider?.list?.({ query: { directory } }).catch(() => undefined),
    client.config.providers({ query: { directory } }).catch(() => undefined),
  ]);

  // Merge providers from both sources, preferring provider.list() which has the full catalog
  const providerListProviders = (providerListRes?.data as any)?.providers ?? [];
  const configProviders = (configProvidersRes?.data as any)?.providers ?? [];

  // Create a map to deduplicate by provider ID
  const providerMap = new Map<string, Provider>();
  for (const p of configProviders) {
    if (p?.id) providerMap.set(p.id, p);
  }
  for (const p of providerListProviders) {
    if (p?.id) providerMap.set(p.id, p);
  }

  return {
    providers: Array.from(providerMap.values()),
    defaults: (configProvidersRes?.data as any)?.default ?? {},
  };
}

export async function fetchModelInfo(
  client: any,
  directory: string,
  modelId: string,
): Promise<{ capabilities?: Model["capabilities"] } | undefined> {
  const res = await client.config
    .model?.({ query: { directory, model: modelId } })
    .catch(() => undefined);
  return res?.data as { capabilities?: Model["capabilities"] } | undefined;
}
