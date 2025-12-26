import type { Provider } from "@opencode-ai/sdk";
import type { OrchestratorConfig } from "../types";
import { resolveAlias, type ModelAliasMap } from "./aliases";
import { deriveModelCapabilities, type ModelCapabilities } from "./capabilities";
import { resolveCapabilityOverride, type CapabilityOverrideMap } from "./capability-overrides";
import { scoreCost } from "./cost";
import { filterProviders, fullModelID, isFullModelID, parseFullModelID } from "./catalog";

export type ModelResolutionContext = {
  providers: Provider[];
  defaults?: Record<string, string>;
  aliases?: ModelAliasMap;
  selection?: OrchestratorConfig["modelSelection"];
  capabilityOverrides?: CapabilityOverrideMap;
};

export type ModelResolutionResult = {
  full: string;
  providerID: string;
  modelID: string;
  capabilities: ModelCapabilities;
  reason: string;
  score: number;
};

export type ModelResolutionError = {
  error: string;
  suggestions?: string[];
};

function normalizeAutoTag(raw: string): string | undefined {
  const value = raw.trim().toLowerCase();
  if (!value) return undefined;
  if (value === "auto" || value === "node") return "auto";
  if (value.startsWith("auto:")) return value;
  if (value.startsWith("node:")) return `auto:${value.slice(5)}`;
  return undefined;
}

function providerPreferenceScore(providerId: string, selection?: OrchestratorConfig["modelSelection"]): number {
  const preferred = selection?.preferredProviders ?? [];
  const idx = preferred.findIndex((id) => id.toLowerCase() === providerId.toLowerCase());
  return idx >= 0 ? 15 - idx : 0;
}

function rankForTag(tag: string, modelId: string, modelName?: string): number {
  const text = `${modelId} ${modelName ?? ""}`.toLowerCase();
  if (tag === "auto:fast") {
    if (/(mini|small|flash|fast|haiku)/i.test(text)) return 10;
  }
  if (tag === "auto:vision") {
    if (/vision|multimodal|image/i.test(text)) return 8;
  }
  if (tag === "auto:docs") {
    if (/doc|research|long|context/i.test(text)) return 6;
  }
  if (tag === "auto:code") {
    if (/code|coder|instruct/i.test(text)) return 5;
  }
  return 0;
}

function capabilityRequirements(tag: string): {
  requiresVision?: boolean;
  requiresTools?: boolean;
  requiresReasoning?: boolean;
  minContext?: number;
  maxContext?: number;
} {
  switch (tag) {
    case "auto:vision":
      return { requiresVision: true };
    case "auto:fast":
      return { maxContext: 32_000 };
    case "auto:docs":
      return { requiresReasoning: true, minContext: 64_000 };
    case "auto:code":
      return { requiresTools: true, minContext: 16_000 };
    case "auto:reasoning":
      return { requiresReasoning: true };
    default:
      return {};
  }
}

function matchesRequirements(cap: ModelCapabilities, requirements: ReturnType<typeof capabilityRequirements>): boolean {
  if (requirements.requiresVision && !cap.supportsVision) return false;
  if (requirements.requiresTools && !cap.supportsTools) return false;
  if (requirements.requiresReasoning && !cap.supportsReasoning) return false;
  if (requirements.minContext && cap.contextWindow > 0 && cap.contextWindow < requirements.minContext) return false;
  if (requirements.maxContext && cap.contextWindow > 0 && cap.contextWindow > requirements.maxContext) return false;
  return true;
}

function pickDefaultModel(
  providers: Provider[],
  defaults?: Record<string, string>,
  selection?: OrchestratorConfig["modelSelection"]
): ModelResolutionResult | undefined {
  if (!defaults) return undefined;
  const preferred = selection?.preferredProviders ?? [];
  const candidates = preferred.length > 0 ? preferred : Object.keys(defaults);
  for (const providerId of candidates) {
    const modelId = defaults[providerId];
    if (!modelId) continue;
    const provider = providers.find((p) => p.id === providerId);
    if (!provider || !(modelId in (provider.models ?? {}))) continue;
    const model = (provider.models ?? {})[modelId] as any;
    const capabilities = deriveModelCapabilities({ model, modelId, modelName: model?.name });
    return {
      full: fullModelID(providerId, modelId),
      providerID: providerId,
      modelID: modelId,
      capabilities,
      reason: "default provider model",
      score: 0,
    };
  }
  return undefined;
}

function collectSuggestions(providers: Provider[], query: string): string[] {
  const needle = query.toLowerCase();
  const out: string[] = [];
  for (const provider of providers) {
    for (const [modelId, model] of Object.entries(provider.models ?? {})) {
      const name = (model as any)?.name ?? "";
      const full = fullModelID(provider.id, modelId);
      if (
        modelId.toLowerCase().includes(needle) ||
        provider.id.toLowerCase().includes(needle) ||
        name.toLowerCase().includes(needle) ||
        full.toLowerCase().includes(needle)
      ) {
        out.push(full);
      }
    }
  }
  return out.slice(0, 20);
}

export function resolveModel(
  input: string,
  ctx: ModelResolutionContext
): ModelResolutionResult | ModelResolutionError {
  const raw = input.trim();
  if (!raw) return { error: "Model is required." };

  const aliasTarget = resolveAlias(raw, ctx.aliases);
  const normalizedInput = aliasTarget ?? raw;

  const autoTag = normalizeAutoTag(normalizedInput);
  const providersAll = ctx.providers;

  if (autoTag) {
    if (autoTag === "auto") {
      const providerScope = filterProviders(providersAll, "configured");
      const defaultPick = pickDefaultModel(providerScope, ctx.defaults, ctx.selection);
      if (defaultPick) return defaultPick;
    }

    const providerScope = filterProviders(providersAll, "configured");
    const requirements = capabilityRequirements(autoTag);

    const candidates: ModelResolutionResult[] = [];

    for (const provider of providerScope) {
      for (const [modelId, model] of Object.entries(provider.models ?? {})) {
        const full = fullModelID(provider.id, modelId);
        const overrides = resolveCapabilityOverride(full, ctx.capabilityOverrides);
        const caps = deriveModelCapabilities({ model: model as any, modelId, modelName: (model as any)?.name, overrides });
        if (!matchesRequirements(caps, requirements)) continue;

        let score = 0;
        if ((model as any)?.status === "deprecated") score -= 50;
        score += rankForTag(autoTag, modelId, (model as any)?.name);

        if (caps.contextWindow > 0) {
          if (autoTag === "auto:docs") score += Math.min(Math.floor(caps.contextWindow / 64_000), 10);
          if (autoTag === "auto:fast") score -= Math.min(Math.floor(caps.contextWindow / 32_000), 5);
          if (autoTag === "auto:code") score += Math.min(Math.floor(caps.contextWindow / 32_000), 5);
        }

        if (autoTag === "auto:cheap") {
          score += 5;
        }

        score += providerPreferenceScore(provider.id, ctx.selection);

        const costScore = scoreCost(caps, ctx.selection);
        if (costScore.tooExpensive) continue;
        score += costScore.score;

        candidates.push({
          full,
          providerID: provider.id,
          modelID: modelId,
          capabilities: caps,
          reason: `auto-selected (${autoTag})`,
          score,
        });
      }
    }

    if (candidates.length === 0) {
      return {
        error: `No models matched ${autoTag}. Configure a compatible model or set an explicit provider/model ID.`,
        suggestions: collectSuggestions(providerScope, autoTag),
      };
    }

    candidates.sort((a, b) => b.score - a.score);
    return candidates[0];
  }

  if (isFullModelID(normalizedInput)) {
    const parsed = parseFullModelID(normalizedInput);
    const provider = providersAll.find((p) => p.id === parsed.providerID);
    if (!provider) {
      return {
        error: `Unknown provider "${parsed.providerID}".`,
        suggestions: providersAll.map((p) => p.id).slice(0, 20),
      };
    }
    const model = (provider.models ?? {})[parsed.modelID];
    if (!model) {
      return {
        error: `Model "${parsed.modelID}" not found for provider "${provider.id}".`,
        suggestions: collectSuggestions([provider], parsed.modelID),
      };
    }
    const overrides = resolveCapabilityOverride(normalizedInput, ctx.capabilityOverrides);
    const caps = deriveModelCapabilities({ model: model as any, modelId: parsed.modelID, modelName: (model as any)?.name, overrides });
    return {
      full: normalizedInput,
      providerID: parsed.providerID,
      modelID: parsed.modelID,
      capabilities: caps,
      reason: aliasTarget ? `alias (${raw})` : "explicit",
      score: 0,
    };
  }

  const matches: ModelResolutionResult[] = [];
  for (const provider of providersAll) {
    for (const [modelId, model] of Object.entries(provider.models ?? {})) {
      if (modelId !== normalizedInput) continue;
      const full = fullModelID(provider.id, modelId);
      const overrides = resolveCapabilityOverride(full, ctx.capabilityOverrides);
      const caps = deriveModelCapabilities({ model: model as any, modelId, modelName: (model as any)?.name, overrides });
      matches.push({
        full,
        providerID: provider.id,
        modelID: modelId,
        capabilities: caps,
        reason: "exact match",
        score: providerPreferenceScore(provider.id, ctx.selection),
      });
    }
  }

  if (matches.length > 0) {
    matches.sort((a, b) => b.score - a.score);
    return matches[0];
  }

  const suggestions = collectSuggestions(providersAll, normalizedInput);
  return {
    error: `Model "${normalizedInput}" not found.`,
    suggestions,
  };
}
