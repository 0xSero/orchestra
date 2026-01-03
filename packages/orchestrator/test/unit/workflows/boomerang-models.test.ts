import { describe, expect, test } from "bun:test";
import type { Model, Provider } from "@opencode-ai/sdk";
import { resolveBoomerangModels } from "../../../src/workflows/boomerang-models";

const makeModel = (input: {
  id: string;
  providerID: string;
  name: string;
}): Model => ({
  id: input.id,
  providerID: input.providerID,
  api: { id: "api", url: "https://example.com", npm: "sdk" },
  name: input.name,
  capabilities: {
    temperature: true,
    reasoning: false,
    attachment: false,
    toolcall: false,
    input: {
      text: true,
      audio: false,
      image: false,
      video: false,
      pdf: false,
    },
    output: {
      text: true,
      audio: false,
      image: false,
      video: false,
      pdf: false,
    },
  },
  cost: { input: 0, output: 0, cache: { read: 0, write: 0 } },
  limit: { context: 0, output: 0 },
  status: "active",
  options: {},
  headers: {},
});

const makeProvider = (input: {
  id: string;
  source?: Provider["source"];
  models: Record<string, Model>;
}): Provider => ({
  id: input.id,
  name: input.id,
  source: input.source ?? "config",
  env: [],
  options: {},
  models: input.models,
});

const providers: Provider[] = [
  makeProvider({
    id: "opencode",
    models: {
      "gpt-5-nano": makeModel({
        id: "gpt-5-nano",
        providerID: "opencode",
        name: "GPT-5 Nano",
      }),
    },
  }),
  makeProvider({
    id: "openai",
    models: {
      "gpt-4o": makeModel({
        id: "gpt-4o",
        providerID: "openai",
        name: "GPT-4o",
      }),
    },
  }),
];

describe("resolveBoomerangModels", () => {
  test("resolves configured planner and implementer models", () => {
    const resolved = resolveBoomerangModels({
      config: {
        plannerModel: "openai/gpt-4o",
        implementerModel: "opencode/gpt-5-nano",
      },
      providers,
      fallbackModel: "opencode/gpt-5-nano",
    });

    expect(resolved.plannerModel).toBe("openai/gpt-4o");
    expect(resolved.implementerModel).toBe("opencode/gpt-5-nano");
  });

  test("falls back when models are missing", () => {
    const resolved = resolveBoomerangModels({
      config: {},
      providers,
      fallbackModel: "opencode/gpt-5-nano",
    });

    expect(resolved.plannerModel).toBe("opencode/gpt-5-nano");
    expect(resolved.implementerModel).toBe("opencode/gpt-5-nano");
  });

  test("throws with suggestions for invalid models", () => {
    expect(() =>
      resolveBoomerangModels({
        config: { plannerModel: "openai/gpt-4x" },
        providers,
        fallbackModel: "opencode/gpt-5-nano",
      }),
    ).toThrow(/openai\/gpt-4o/);
  });
});
