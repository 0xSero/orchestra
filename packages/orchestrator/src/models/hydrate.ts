import type { WorkerProfile } from "../types";
import {
  fetchOpencodeConfig,
  fetchProviders,
  flattenProviders,
  parseFullModelID,
  pickDocsModel,
  pickFastModel,
  pickVisionModel,
  resolveModelRef,
} from "./catalog";

export type ProfileModelHydrationChange = {
  profileId: string;
  from: string;
  to: string;
  reason: string;
};

export async function hydrateProfileModelsFromOpencode(input: {
  client: any;
  directory: string;
  profiles: Record<string, WorkerProfile>;
}): Promise<{
  profiles: Record<string, WorkerProfile>;
  changes: ProfileModelHydrationChange[];
  fallbackModel?: string;
}> {
  const [cfg, providersRes] = await Promise.all([
    fetchOpencodeConfig(input.client, input.directory),
    fetchProviders(input.client, input.directory),
  ]);

  const providersAll = providersRes.providers;
  // For auto-selection (node:vision, node:fast, etc.), prefer configured providers.
  // But allow ALL providers for explicit model references since the user chose them.
  const providersUsable = providersAll.filter((p) => p.id === "opencode" || p.source !== "api");
  const catalog = flattenProviders(providersUsable);

  // Collect provider IDs explicitly referenced in profile models (user intent = use them)
  const explicitlyReferencedProviders = new Set<string>();
  for (const profile of Object.values(input.profiles)) {
    const model = profile.model.trim();
    if (model.includes("/") && !model.startsWith("auto") && !model.startsWith("node")) {
      const providerID = model.split("/")[0];
      explicitlyReferencedProviders.add(providerID);
    }
  }

  const fallbackCandidate =
    cfg?.model ||
    (providersRes.defaults?.opencode ? `opencode/${providersRes.defaults.opencode}` : undefined) ||
    "opencode/gpt-5-nano";

  const resolvedFallback = resolveModelRef(fallbackCandidate, providersAll);
  const fallbackModel = "error" in resolvedFallback ? fallbackCandidate : resolvedFallback.full;

  const changes: ProfileModelHydrationChange[] = [];

  const resolveAuto = (profile: WorkerProfile): { model: string; reason: string } => {
    const tag = profile.model;
    const isVision = profile.supportsVision || /(?:auto|node):vision/i.test(tag);
    const isDocs = /(?:auto|node):docs/i.test(tag);
    const isFast = /(?:auto|node):fast/i.test(tag);

    const picked = isVision
      ? pickVisionModel(catalog)
      : isDocs
        ? pickDocsModel(catalog)
        : isFast
          ? pickFastModel(catalog)
          : undefined;

    if (picked) {
      return { model: picked.full, reason: `auto-selected from configured models (${tag})` };
    }

    // Vision workers should never silently downgrade to a text-only model.
    if (isVision) {
      throw new Error(
        `No vision-capable models found for "${profile.id}" (model tag: "${tag}"). ` +
          `Configure a vision model in OpenCode or set the profile model explicitly.`
      );
    }

    return { model: fallbackModel, reason: `fallback to default model (${tag})` };
  };

  const next: Record<string, WorkerProfile> = {};
  for (const [id, profile] of Object.entries(input.profiles)) {
    let desired = profile.model;
    let reason = "";

    const modelSpec = profile.model.trim();
    const isNodeTag = modelSpec.startsWith("auto") || modelSpec.startsWith("node");

    if (isNodeTag) {
      const resolved = resolveAuto(profile);
      desired = resolved.model;
      reason = resolved.reason;
    } else {
      // User explicitly specified a model - trust their choice and use ALL providers
      const resolved = resolveModelRef(profile.model, providersAll);
      if ("error" in resolved) {
        const suffix = resolved.suggestions?.length ? `\nSuggestions:\n- ${resolved.suggestions.join("\n- ")}` : "";
        throw new Error(`Invalid model for profile "${profile.id}": ${resolved.error}${suffix}`);
      }
      desired = resolved.full;
    }

    if (profile.supportsVision) {
      const parsed = parseFullModelID(desired);
      const provider = providersAll.find((p) => p.id === parsed.providerID);
      const model = provider?.models?.[parsed.modelID] as any;
      const caps = model?.capabilities as any | undefined;
      if (caps) {
        const visionCapable = Boolean(caps?.attachment || caps?.input?.image);
        if (!visionCapable) {
          throw new Error(
            `Profile "${profile.id}" requires vision, but selected model "${desired}" does not appear vision-capable. ` +
              `Choose a model with image input support.`
          );
        }
      }
    }

    next[id] = { ...profile, model: desired };

    if (desired !== profile.model) {
      changes.push({
        profileId: id,
        from: profile.model,
        to: desired,
        reason: reason || "resolved",
      });
    }
  }

  return { profiles: next, changes, fallbackModel };
}
