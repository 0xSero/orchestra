import type { OrchestratorConfig, WorkerProfile } from "../types";
import { normalizeAliases } from "./aliases";
import { fetchOpencodeConfig, fetchProviders } from "./catalog";
import { resolveModel } from "./resolver";

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
  modelAliases?: OrchestratorConfig["modelAliases"];
  modelSelection?: OrchestratorConfig["modelSelection"];
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
  const aliases = normalizeAliases(input.modelAliases);

  const fallbackCandidate =
    cfg?.model ||
    (providersRes.defaults?.opencode ? `opencode/${providersRes.defaults.opencode}` : undefined) ||
    "opencode/gpt-5-nano";

  const resolvedFallback = resolveModel(fallbackCandidate, {
    providers: providersAll,
    aliases,
    selection: input.modelSelection,
    defaults: providersRes.defaults,
  });
  const fallbackModel = "error" in resolvedFallback ? fallbackCandidate : resolvedFallback.full;

  const changes: ProfileModelHydrationChange[] = [];

  const next: Record<string, WorkerProfile> = {};
  for (const [id, profile] of Object.entries(input.profiles)) {
    let desired = profile.model;
    let reason = "";

    const modelSpec = profile.model.trim();
    const isAutoTag = modelSpec.startsWith("auto") || modelSpec.startsWith("node");

    const resolved = resolveModel(modelSpec, {
      providers: providersAll,
      defaults: providersRes.defaults,
      aliases,
      selection: input.modelSelection,
    });

    if ("error" in resolved) {
      if (isAutoTag && !/vision/i.test(modelSpec)) {
        desired = fallbackModel;
        reason = `fallback to default model (${modelSpec})`;
      } else {
        const suffix = resolved.suggestions?.length ? `\nSuggestions:\n- ${resolved.suggestions.join("\n- ")}` : "";
        throw new Error(`Invalid model for profile "${profile.id}": ${resolved.error}${suffix}`);
      }
    } else {
      desired = resolved.full;
      reason = resolved.reason;
      if (profile.supportsVision && !resolved.capabilities.supportsVision) {
        throw new Error(
          `Profile "${profile.id}" requires vision, but selected model "${desired}" does not appear vision-capable. ` +
            `Choose a model with image input support.`,
        );
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
