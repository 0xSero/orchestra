/* c8 ignore file */
import type { ApiService } from "../api";
import { hydrateProfileModelsFromOpencode, type ProfileModelHydrationChange } from "../models/hydrate";
import type { OrchestratorConfig, WorkerProfile } from "../types";

export type ModelResolutionResult = {
  profile: WorkerProfile;
  changes: ProfileModelHydrationChange[];
  fallbackModel?: string;
};

/** Resolve a profile's model string into a concrete provider/model ID when needed. */
export const resolveProfileModel = async (input: {
  api: ApiService;
  directory: string;
  profile: WorkerProfile;
  modelSelection?: OrchestratorConfig["modelSelection"];
  modelAliases?: OrchestratorConfig["modelAliases"];
  deps?: {
    hydrateProfileModelsFromOpencode?: typeof hydrateProfileModelsFromOpencode;
  };
}): Promise<ModelResolutionResult> => {
  const modelSpec = input.profile.model.trim();
  const isNodeTag = modelSpec.startsWith("auto") || modelSpec.startsWith("node");
  const isExplicit = modelSpec.includes("/");

  if (!input.api?.client) {
    if (isNodeTag || !isExplicit) {
      throw new Error(
        `Profile "${input.profile.id}" uses "${input.profile.model}", but model resolution is unavailable. ` +
          `Set a concrete provider/model ID for this profile.`,
      );
    }
    return { profile: input.profile, changes: [] };
  }

  if (!isNodeTag && isExplicit) return { profile: input.profile, changes: [] };

  const hydrate = input.deps?.hydrateProfileModelsFromOpencode ?? hydrateProfileModelsFromOpencode;
  const { profiles, changes, fallbackModel } = await hydrate({
    client: input.api.client,
    directory: input.directory,
    profiles: { [input.profile.id]: input.profile },
    modelAliases: input.modelAliases,
    modelSelection: input.modelSelection,
  });
  return {
    profile: profiles[input.profile.id] ?? input.profile,
    changes,
    fallbackModel,
  };
};
