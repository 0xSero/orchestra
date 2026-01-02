import type { Config, Provider } from "@opencode-ai/sdk";
import type { WorkerProfile } from "../types";
import {
  filterProviders,
  flattenProviders,
  pickDocsModel,
  pickFastModel,
  pickVisionModel,
  resolveModelRef,
} from "./catalog";

export type WorkerModelResolution = {
  resolvedModel: string;
  modelRef: string;
  reason: string;
};

export type ResolveWorkerModelInput = {
  profile: WorkerProfile;
  overrideModelRef?: string;
  config?: Config;
  providers: Provider[];
  providerDefaults?: Record<string, string>;
};

export type ResolveFallbackModelInput = {
  config?: Config;
  providers: Provider[];
  providerDefaults?: Record<string, string>;
};

export function resolveFallbackModel(input: ResolveFallbackModelInput): string {
  const fallbackCandidate =
    input.config?.model ||
    (input.providerDefaults?.opencode
      ? `opencode/${input.providerDefaults.opencode}`
      : undefined) ||
    "opencode/gpt-5-nano";
  const resolvedFallback = resolveModelRef(fallbackCandidate, input.providers);
  return "error" in resolvedFallback
    ? fallbackCandidate
    : resolvedFallback.full;
}

export function resolveWorkerModel(
  input: ResolveWorkerModelInput,
): WorkerModelResolution {
  const modelRef = (input.overrideModelRef ?? input.profile.model).trim();
  const providersAll = input.providers;
  const providersUsable = filterProviders(providersAll, "configured");
  const catalog = flattenProviders(providersUsable);
  const fallbackModel = resolveFallbackModel({
    config: input.config,
    providers: providersAll,
    providerDefaults: input.providerDefaults,
  });

  const isNodeTag = modelRef.startsWith("auto") || modelRef.startsWith("node");
  if (isNodeTag) {
    const isVision =
      input.profile.supportsVision || /(?:auto|node):vision/i.test(modelRef);
    const isDocs = /(?:auto|node):docs/i.test(modelRef);
    const isFast = /(?:auto|node):fast/i.test(modelRef);

    if (isFast && input.config?.small_model) {
      const resolvedSmall = resolveModelRef(
        input.config.small_model,
        providersAll,
      );
      if (!("error" in resolvedSmall)) {
        return {
          resolvedModel: resolvedSmall.full,
          modelRef,
          reason: `auto-selected from small_model (${modelRef})`,
        };
      }
    }

    const picked = isVision
      ? pickVisionModel(catalog)
      : isDocs
        ? pickDocsModel(catalog)
        : isFast
          ? pickFastModel(catalog)
          : undefined;

    if (picked) {
      return {
        resolvedModel: picked.full,
        modelRef,
        reason: `auto-selected from configured models (${modelRef})`,
      };
    }

    if (isVision) {
      throw new Error(
        `No vision-capable models found for "${input.profile.id}" (model tag: "${modelRef}"). ` +
          `Configure a vision model in OpenCode or set the profile model explicitly.`,
      );
    }

    return {
      resolvedModel: fallbackModel,
      modelRef,
      reason: `fallback to default model (${modelRef})`,
    };
  }

  const resolved = resolveModelRef(modelRef, providersAll);
  if ("error" in resolved) {
    const suffix = resolved.suggestions?.length
      ? `\nSuggestions:\n- ${resolved.suggestions.join("\n- ")}`
      : "";
    throw new Error(
      `Invalid model for profile "${input.profile.id}": ${resolved.error}${suffix}`,
    );
  }

  const reason =
    resolved.full === modelRef ? "configured" : `resolved from ${modelRef}`;
  return { resolvedModel: resolved.full, modelRef, reason };
}
