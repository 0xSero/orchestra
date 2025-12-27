import type { ModelCapabilities } from "./capabilities";

export type CapabilityOverrideMap = Record<string, Partial<ModelCapabilities>>;

export function resolveCapabilityOverride(
  modelFullId: string,
  overrides?: CapabilityOverrideMap,
): Partial<ModelCapabilities> | undefined {
  if (!overrides) return undefined;
  if (overrides[modelFullId]) return overrides[modelFullId];
  const lowered = modelFullId.toLowerCase();
  const match = Object.entries(overrides).find(([key]) => key.toLowerCase() === lowered);
  return match ? match[1] : undefined;
}
