import { describe, expect, test } from "bun:test";
import { getIntegrationEnv } from "../../src/integrations/registry";
import { resolveIntegrationsForProfile } from "../../src/integrations/selection";
import type { IntegrationsConfig, WorkerProfile } from "../../src/types";

describe("integration selection", () => {
  const globalIntegrations: IntegrationsConfig = {
    linear: { apiKey: "key", teamId: "team" },
    zendesk: { subdomain: "example" },
    monitoring: { enabled: true },
  };

  const baseProfile: WorkerProfile = {
    id: "alpha",
    name: "Alpha",
    model: "model-a",
    purpose: "test",
    whenToUse: "testing",
  };

  test("returns empty when no selection", () => {
    const resolved = resolveIntegrationsForProfile(baseProfile, globalIntegrations);
    expect(resolved).toEqual({});
  });

  test("inherits all integrations", () => {
    const resolved = resolveIntegrationsForProfile(
      { ...baseProfile, integrations: { inheritAll: true } },
      globalIntegrations,
    );
    expect(Object.keys(resolved).sort()).toEqual(["linear", "monitoring", "zendesk"]);
  });

  test("includes only allow-listed integrations", () => {
    const resolved = resolveIntegrationsForProfile(
      { ...baseProfile, integrations: { include: ["linear"] } },
      globalIntegrations,
    );
    expect(Object.keys(resolved)).toEqual(["linear"]);
  });

  test("excludes integrations after inheritance", () => {
    const resolved = resolveIntegrationsForProfile(
      { ...baseProfile, integrations: { inheritAll: true, exclude: ["monitoring"] } },
      globalIntegrations,
    );
    expect(resolved.monitoring).toBeUndefined();
    expect(resolved.linear).toBeDefined();
  });
});

describe("integration registry", () => {
  test("exports Linear env vars", () => {
    const env = getIntegrationEnv({
      linear: {
        apiKey: "key",
        teamId: "team",
        apiUrl: "https://linear.test/graphql",
        projectPrefix: "proj",
      },
    });

    expect(env.LINEAR_API_KEY).toBe("key");
    expect(env.LINEAR_TEAM_ID).toBe("team");
    expect(env.LINEAR_API_URL).toBe("https://linear.test/graphql");
    expect(env.LINEAR_PROJECT_PREFIX).toBe("proj");
  });
});
