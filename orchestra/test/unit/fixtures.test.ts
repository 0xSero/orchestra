import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { createTestConfig, createTestProfile, createMockJobs, createMockProviders } from "../helpers/fixtures-factories";
import { createTestFixtures } from "../helpers/fixtures-manager";

describe("fixture factories", () => {
  test("creates test profiles and configs", () => {
    const profile = createTestProfile("alpha");
    expect(profile.id).toBe("alpha");
    expect(profile.name).toBe("Test alpha");

    const cfg = createTestConfig({ basePort: 19000, ui: { toasts: true } });
    expect(cfg.basePort).toBe(19000);
    expect(cfg.ui?.toasts).toBe(true);
  });

  test("creates mock providers for each scenario", () => {
    const scenarios = [
      "single-provider",
      "multi-provider-conflict",
      "vision-capable",
      "no-credentials",
      "tied-scores",
      "deprecated-models",
    ] as const;

    for (const scenario of scenarios) {
      const providers = createMockProviders(scenario);
      expect(providers.length).toBeGreaterThan(0);
    }
  });

  test("creates mock jobs with optional completion", () => {
    const pending = createMockJobs(2);
    expect(pending[0].status).toBe("pending");

    const completed = createMockJobs(2, { completed: true, olderThanHours: 1 });
    expect(completed[0].status).toBe("completed");
    expect(completed[0].completedAt).toBeTruthy();
  });
});

describe("fixture manager", () => {
  test("loads fixtures and manages temp dirs", async () => {
    const fixtures = createTestFixtures();

    const configNames = await fixtures.listConfigs();
    const profileNames = await fixtures.listProfiles();
    expect(configNames.length).toBeGreaterThan(0);
    expect(profileNames.length).toBeGreaterThan(0);

    const cfg = await fixtures.loadConfig("default");
    expect(cfg.basePort).toBeDefined();

    const profile = await fixtures.loadProfile("test-worker");
    expect(profile.id).toBe("test-worker");

    const tmpDir = await fixtures.createTempDir();
    expect(existsSync(tmpDir)).toBe(true);

    await fixtures.cleanup();
    expect(existsSync(tmpDir)).toBe(false);
  });

  test("throws when missing fixtures", async () => {
    const fixtures = createTestFixtures();
    await expect(fixtures.loadConfig("missing-config")).rejects.toThrow("Config fixture not found");
    await expect(fixtures.loadProfile("missing-profile")).rejects.toThrow("Profile fixture not found");
  });
});
