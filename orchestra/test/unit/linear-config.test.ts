import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { loadLinearConfigFromEnv, resolveLinearConfig } from "../../src/integrations/linear-config";

const snapshotEnv = () => ({
  LINEAR_API_KEY: process.env.LINEAR_API_KEY,
  LINEAR_TEAM_ID: process.env.LINEAR_TEAM_ID,
  LINEAR_API_URL: process.env.LINEAR_API_URL,
  LINEAR_PROJECT_PREFIX: process.env.LINEAR_PROJECT_PREFIX,
});

const restoreEnv = (snapshot: ReturnType<typeof snapshotEnv>) => {
  const entries = Object.entries(snapshot);
  for (const [key, value] of entries) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
};

describe("linear config", () => {
  let envSnapshot: ReturnType<typeof snapshotEnv>;

  beforeEach(() => {
    envSnapshot = snapshotEnv();
  });

  afterEach(() => {
    restoreEnv(envSnapshot);
  });

  test("loadLinearConfigFromEnv returns undefined when missing env", () => {
    delete process.env.LINEAR_API_KEY;
    delete process.env.LINEAR_TEAM_ID;
    expect(loadLinearConfigFromEnv()).toBeUndefined();
  });

  test("loadLinearConfigFromEnv returns config when env present", () => {
    process.env.LINEAR_API_KEY = "key";
    process.env.LINEAR_TEAM_ID = "team";
    process.env.LINEAR_PROJECT_PREFIX = "proj";
    const cfg = loadLinearConfigFromEnv();
    expect(cfg?.apiKey).toBe("key");
    expect(cfg?.teamId).toBe("team");
    expect(cfg?.projectPrefix).toBe("proj");
    expect(cfg?.apiUrl).toBe("https://api.linear.app/graphql");
  });

  test("resolveLinearConfig throws when disabled", () => {
    expect(() => resolveLinearConfig({ enabled: false })).toThrow("Linear integration is disabled.");
  });

  test("resolveLinearConfig throws when credentials missing", () => {
    delete process.env.LINEAR_API_KEY;
    delete process.env.LINEAR_TEAM_ID;
    expect(() => resolveLinearConfig({})).toThrow("Missing Linear credentials");
  });

  test("resolveLinearConfig prefers input overrides", () => {
    process.env.LINEAR_API_KEY = "env-key";
    process.env.LINEAR_TEAM_ID = "env-team";
    const cfg = resolveLinearConfig({
      apiKey: "input-key",
      teamId: "input-team",
      apiUrl: "https://linear.test/graphql",
      projectPrefix: "proj",
    });
    expect(cfg.apiKey).toBe("input-key");
    expect(cfg.teamId).toBe("input-team");
    expect(cfg.apiUrl).toBe("https://linear.test/graphql");
    expect(cfg.projectPrefix).toBe("proj");
  });
});
