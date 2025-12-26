import type { SpawnPolicy, SpawnPolicyConfig } from "../types";

export function resolveSpawnPolicy(config: SpawnPolicyConfig | undefined, id: string): SpawnPolicy {
  const defaults = config?.default ?? {};
  const override = config?.profiles?.[id] ?? {};
  return { ...defaults, ...override };
}

export function canAutoSpawn(config: SpawnPolicyConfig | undefined, id: string): boolean {
  return resolveSpawnPolicy(config, id).autoSpawn !== false;
}

export function canSpawnOnDemand(config: SpawnPolicyConfig | undefined, id: string): boolean {
  return resolveSpawnPolicy(config, id).onDemand !== false;
}

export function canSpawnManually(config: SpawnPolicyConfig | undefined, id: string): boolean {
  return resolveSpawnPolicy(config, id).allowManual !== false;
}

export function canWarmPool(config: SpawnPolicyConfig | undefined, id: string): boolean {
  return resolveSpawnPolicy(config, id).warmPool !== false;
}

export function canReuseExisting(config: SpawnPolicyConfig | undefined, id: string): boolean {
  return resolveSpawnPolicy(config, id).reuseExisting !== false;
}
