import type { WorkerProfile } from "../types";
import {
  fetchModelInfo,
  fetchOpencodeConfig,
  fetchProviders,
  parseFullModelID,
} from "./catalog";
import { resolveFallbackModel, resolveWorkerModel } from "./resolve";

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
  const fallbackModel = resolveFallbackModel({
    config: cfg,
    providers: providersAll,
    providerDefaults: providersRes.defaults,
  });

  const changes: ProfileModelHydrationChange[] = [];

  const next: Record<string, WorkerProfile> = {};
  for (const [id, profile] of Object.entries(input.profiles)) {
    const resolved = resolveWorkerModel({
      profile,
      config: cfg,
      providers: providersAll,
      providerDefaults: providersRes.defaults,
    });
    const desired = resolved.resolvedModel;
    const reason = resolved.reason;

    if (profile.supportsVision) {
      const parsed = parseFullModelID(desired);
      const provider = providersAll.find((p) => p.id === parsed.providerID);
      const model = provider?.models?.[parsed.modelID] as any;
      let caps = model?.capabilities as any | undefined;

      // If capabilities not in provider list, fetch from SDK
      if (!caps) {
        const modelInfo = await fetchModelInfo(
          input.client,
          input.directory,
          desired,
        );
        caps = modelInfo?.capabilities;
      }

      if (caps) {
        const visionCapable = Boolean(caps?.attachment || caps?.input?.image);
        if (!visionCapable) {
          throw new Error(
            `Profile "${profile.id}" requires vision, but selected model "${desired}" does not appear vision-capable. ` +
              `Choose a model with image input support.`,
          );
        }
      } else {
        console.warn(
          `[hydrate] No capability metadata for "${desired}" - ` +
            `trusting profile "${profile.id}" supportsVision flag`,
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
