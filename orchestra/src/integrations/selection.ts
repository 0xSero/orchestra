import type { IntegrationsConfig, WorkerProfile } from "../types";

export const resolveIntegrationsForProfile = (
  profile: WorkerProfile,
  globalIntegrations?: IntegrationsConfig,
): Record<string, unknown> => {
  const selection = profile.integrations;
  if (!selection) return {};

  const integrations = (globalIntegrations ?? {}) as Record<string, unknown>;
  const resolved: Record<string, unknown> = {};

  if (selection.inheritAll) {
    for (const [key, value] of Object.entries(integrations)) {
      if (value !== undefined) resolved[key] = value;
    }
  }

  if (selection.include && selection.include.length > 0) {
    for (const key of selection.include) {
      if (key in integrations) resolved[key] = integrations[key];
    }
  }

  if (selection.exclude && selection.exclude.length > 0) {
    for (const key of selection.exclude) {
      delete resolved[key];
    }
  }

  return resolved;
};
