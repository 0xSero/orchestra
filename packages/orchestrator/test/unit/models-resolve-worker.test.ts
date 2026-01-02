import { describe, expect, test } from "bun:test";
import type { Config, Provider } from "@opencode-ai/sdk";
import type { WorkerProfile } from "../../src/types";
import { resolveWorkerModel } from "../../src/models/resolve";

const makeProvider = (input: {
  id: string;
  source: Provider["source"];
  models?: Record<string, unknown>;
  key?: string;
}): Provider => {
  return {
    id: input.id,
    source: input.source,
    models: input.models ?? {},
    key: input.key,
  } as Provider;
};

const makeProfile = (model: string): WorkerProfile => {
  return {
    id: "fast",
    name: "Fast",
    model,
    purpose: "Test",
    whenToUse: "Test",
  };
};

describe("resolveWorkerModel", () => {
  test("prefers config small_model for node:fast", () => {
    const configured = makeProvider({
      id: "cfg",
      source: "config",
      models: {
        "fast-small": {
          name: "fast-small",
          cost: { input: 5, output: 0, cache: { read: 0, write: 0 } },
        },
        "fast-ultra": {
          name: "fast-ultra",
          limit: { context: 128000, output: 0 },
        },
      },
    });

    const resolved = resolveWorkerModel({
      profile: makeProfile("node:fast"),
      config: {
        model: "cfg/fast-ultra",
        small_model: "cfg/fast-small",
      } as Config,
      providers: [configured],
    });

    expect(resolved.resolvedModel).toBe("cfg/fast-small");
    expect(resolved.reason).toBe("auto-selected from small_model (node:fast)");
  });

  test("falls back to catalog when small_model is invalid", () => {
    const configured = makeProvider({
      id: "cfg",
      source: "config",
      models: {
        "fast-ultra": {
          name: "fast-ultra",
          limit: { context: 128000, output: 0 },
        },
      },
    });

    const resolved = resolveWorkerModel({
      profile: makeProfile("node:fast"),
      config: { model: "cfg/fast-ultra", small_model: "cfg/missing" } as Config,
      providers: [configured],
    });

    expect(resolved.resolvedModel).toBe("cfg/fast-ultra");
    expect(resolved.reason).toBe(
      "auto-selected from configured models (node:fast)",
    );
  });

  test("accepts explicit api provider models without key", () => {
    const api = makeProvider({
      id: "api",
      source: "api",
      models: { "fast-ultra": { name: "fast-ultra" } },
    });

    const resolved = resolveWorkerModel({
      profile: makeProfile("api/fast-ultra"),
      providers: [api],
    });

    expect(resolved.resolvedModel).toBe("api/fast-ultra");
    expect(resolved.reason).toBe("configured");
  });
});
