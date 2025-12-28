import { describe, expect, test } from "bun:test";
import type { WorkerProfile } from "../../src/types";
import { getDefaultSessionMode, resolveWorkerEnv, resolveWorkerMcp } from "../../src/workers/spawn-env";

describe("spawn env helpers", () => {
  test("builds worker env from explicit env and prefixes", () => {
    const original = process.env.TEST_PREFIX_VALUE;
    process.env.TEST_PREFIX_VALUE = "prefixed";

    const profile: WorkerProfile = {
      id: "alpha",
      name: "Alpha",
      model: "model-a",
      purpose: "test",
      whenToUse: "testing",
      env: { CUSTOM: "value" },
      envPrefixes: ["TEST_PREFIX_"],
    };

    const env = resolveWorkerEnv(profile);
    expect(env.CUSTOM).toBe("value");
    expect(env.TEST_PREFIX_VALUE).toBe("prefixed");

    if (original) process.env.TEST_PREFIX_VALUE = original;
    else delete process.env.TEST_PREFIX_VALUE;
  });

  test("skips empty env values for prefixes", () => {
    const original = process.env.TEST_PREFIX_EMPTY;
    process.env.TEST_PREFIX_EMPTY = "";

    const profile: WorkerProfile = {
      id: "beta",
      name: "Beta",
      model: "model-b",
      purpose: "test",
      whenToUse: "testing",
      envPrefixes: ["TEST_PREFIX_"],
    };

    const env = resolveWorkerEnv(profile);
    expect(env.TEST_PREFIX_EMPTY).toBeUndefined();

    if (original !== undefined) process.env.TEST_PREFIX_EMPTY = original;
    else delete process.env.TEST_PREFIX_EMPTY;
  });

  test("resolves MCP config with inheritance and filtering", async () => {
    const profile: WorkerProfile = {
      id: "alpha",
      name: "Alpha",
      model: "model-a",
      purpose: "test",
      whenToUse: "testing",
      mcp: { inheritAll: true },
    };

    const parent = { mcp: { alpha: { token: "x" } } };
    expect(await resolveWorkerMcp(profile, parent)).toEqual({ alpha: { token: "x" } });

    profile.mcp = { servers: ["alpha", "missing"] };
    expect(await resolveWorkerMcp(profile, parent)).toEqual({ alpha: { token: "x" } });

    profile.mcp = { servers: ["missing"] };
    expect(await resolveWorkerMcp(profile, parent)).toBeUndefined();

    profile.mcp = { inheritAll: true };
    expect(await resolveWorkerMcp(profile, {} as never)).toBeUndefined();

    profile.mcp = undefined;
    expect(await resolveWorkerMcp(profile, parent)).toBeUndefined();
  });

  test("returns linked session mode by default", () => {
    const mode = getDefaultSessionMode({
      id: "memory",
      name: "Memory",
      model: "model-a",
      purpose: "test",
      whenToUse: "testing",
    });
    expect(mode).toBe("linked");

    const defaultMode = getDefaultSessionMode({
      id: "alpha",
      name: "Alpha",
      model: "model-a",
      purpose: "test",
      whenToUse: "testing",
    });
    expect(defaultMode).toBe("linked");
  });
});
