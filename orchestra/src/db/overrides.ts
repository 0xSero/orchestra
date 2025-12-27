import type { WorkerProfile } from "../types";
import type { WorkerConfig } from "./index";

export function applyWorkerConfigOverrides(
  profiles: Record<string, WorkerProfile>,
  configs: WorkerConfig[],
): Record<string, WorkerProfile> {
  if (!configs.length) return profiles;

  const next: Record<string, WorkerProfile> = {};
  for (const [id, profile] of Object.entries(profiles)) {
    next[id] = { ...profile };
  }

  for (const config of configs) {
    const profile = next[config.workerId];
    if (!profile) continue;

    if (config.model !== null && config.model !== undefined) {
      profile.model = config.model;
    }
    if (config.temperature !== null && config.temperature !== undefined) {
      profile.temperature = config.temperature;
    }
    if (config.maxTokens !== null && config.maxTokens !== undefined) {
      profile.maxTokens = config.maxTokens;
    }
    if (typeof config.enabled === "boolean") {
      profile.enabled = config.enabled;
    }
  }

  return next;
}
