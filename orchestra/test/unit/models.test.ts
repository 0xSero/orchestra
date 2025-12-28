import { describe, expect, test } from "bun:test";
import type { Model, Provider } from "@opencode-ai/sdk";
import { normalizeAliases, resolveAlias } from "../../src/models/aliases";
import { resolveCapabilityOverride } from "../../src/models/capability-overrides";
import {
  fetchOpencodeConfig,
  fetchProviders,
  filterProviders,
  flattenProviders,
  fullModelID,
  isFullModelID,
  parseFullModelID,
  pickDocsModel,
  pickFastModel,
  pickVisionModel,
  resolveModelRef,
} from "../../src/models/catalog";
import { averageCostPer1kTokens, scoreCost } from "../../src/models/cost";
import { hydrateProfileModelsFromOpencode } from "../../src/models/hydrate";
import { resolveModel } from "../../src/models/resolver";
import type { OrchestratorConfig, WorkerProfile } from "../../src/types";

type CapabilityOverrides = Omit<Partial<Model["capabilities"]>, "input" | "output"> & {
  input?: Partial<Model["capabilities"]["input"]>;
  output?: Partial<Model["capabilities"]["output"]>;
};

const buildModel = (input: {
  id: string;
  providerID: string;
  name: string;
  status?: Model["status"];
  capabilities?: CapabilityOverrides;
  limit?: Model["limit"];
  cost?: Model["cost"];
}): Model => {
  const baseInput = { text: true, audio: false, image: false, video: false, pdf: false };
  const baseOutput = { text: true, audio: false, image: false, video: false, pdf: false };
  const capabilities = {
    temperature: false,
    reasoning: false,
    attachment: false,
    toolcall: false,
    ...input.capabilities,
    input: { ...baseInput, ...input.capabilities?.input },
    output: { ...baseOutput, ...input.capabilities?.output },
  };
  return {
    id: input.id,
    providerID: input.providerID,
    api: { id: input.providerID, url: "https://api.example.com", npm: "@opencode-ai/sdk" },
    name: input.name,
    capabilities,
    cost: input.cost ?? { input: 0, output: 0, cache: { read: 0, write: 0 } },
    limit: input.limit ?? { context: 0, output: 0 },
    status: input.status ?? "active",
    options: {},
    headers: {},
  };
};

const buildProvider = (input: {
  id: string;
  source: Provider["source"];
  models: Record<string, Model>;
  key?: string;
  name?: string;
  env?: string[];
  options?: Record<string, unknown>;
}): Provider => ({
  id: input.id,
  name: input.name ?? input.id,
  source: input.source,
  env: input.env ?? [],
  key: input.key,
  options: input.options ?? {},
  models: input.models,
});

const providers: Provider[] = [
  buildProvider({
    id: "opencode",
    source: "config",
    models: {
      "gpt-5-nano": buildModel({
        id: "gpt-5-nano",
        providerID: "opencode",
        name: "GPT-5 Nano Vision",
        status: "active",
        capabilities: {
          attachment: true,
          toolcall: true,
          reasoning: true,
          input: { text: true, audio: false, image: true, video: false, pdf: false },
        },
        limit: { context: 128000, output: 4096 },
        cost: { input: 0.01, output: 0.02, cache: { read: 0, write: 0 } },
      }),
      "legacy-model": buildModel({
        id: "legacy-model",
        providerID: "opencode",
        name: "Legacy",
        status: "deprecated",
        capabilities: { input: { text: true, audio: false, image: false, video: false, pdf: false } },
        limit: { context: 16000, output: 1024 },
        cost: { input: 0, output: 0, cache: { read: 0, write: 0 } },
      }),
    },
  }),
  buildProvider({
    id: "fast-provider",
    source: "env",
    key: "fast-key",
    models: {
      "fast-mini": buildModel({
        id: "fast-mini",
        providerID: "fast-provider",
        name: "Fast Mini",
        capabilities: { input: { text: true, audio: false, image: false, video: false, pdf: false } },
        limit: { context: 32000, output: 2048 },
        cost: { input: 0.001, output: 0.002, cache: { read: 0, write: 0 } },
      }),
    },
  }),
  buildProvider({
    id: "api-provider",
    source: "api",
    models: {
      "api-model": buildModel({
        id: "api-model",
        providerID: "api-provider",
        name: "API Model",
        capabilities: { input: { text: true, audio: false, image: false, video: false, pdf: false } },
      }),
    },
  }),
];

describe("model helpers", () => {
  test("normalizes aliases and resolves alias values", () => {
    const aliases = normalizeAliases({ "My-Alias": "opencode/gpt-5-nano", other: 123 as unknown as string });
    expect(aliases["my-alias"]).toBe("opencode/gpt-5-nano");
    expect(resolveAlias("My-Alias", aliases)).toBe("opencode/gpt-5-nano");
  });

  test("resolves capability overrides by case-insensitive key", () => {
    const override = resolveCapabilityOverride("opencode/gpt-5-nano", {
      "OpenCode/GPT-5-NANO": { supportsVision: false },
    });
    expect(override?.supportsVision).toBe(false);
  });

  test("computes costs and scores", () => {
    expect(averageCostPer1kTokens({ inputCostPer1kTokens: 0.01, outputCostPer1kTokens: 0.03 } as never)).toBe(0.02);
    expect(
      scoreCost({ inputCostPer1kTokens: 0.2, outputCostPer1kTokens: 0.2 } as never, {
        maxCostPer1kTokens: 0.1,
      }),
    ).toEqual({ score: -100, tooExpensive: true });
    expect(scoreCost({} as never, { mode: "economical" })).toEqual({ score: -20, tooExpensive: false });
  });

  test("flattens providers and picks models", () => {
    const flattened = flattenProviders(providers);
    expect(flattened.some((entry) => entry.full === "opencode/gpt-5-nano")).toBe(true);
    expect(isFullModelID("opencode/gpt-5-nano")).toBe(true);
    expect(parseFullModelID("opencode/gpt-5-nano")).toEqual({ providerID: "opencode", modelID: "gpt-5-nano" });
    expect(fullModelID("opencode", "gpt-5-nano")).toBe("opencode/gpt-5-nano");

    const vision = pickVisionModel(flattened);
    expect(vision?.modelID).toBe("gpt-5-nano");

    const fast = pickFastModel(flattened);
    expect(fast?.modelID).toBe("fast-mini");

    const docs = pickDocsModel(flattened);
    expect(docs?.modelID).toBe("gpt-5-nano");
  });

  test("scores vision models with heuristics", () => {
    const candidates = [
      {
        full: "zhipu/glm-4.6v",
        providerID: "zhipu",
        modelID: "glm-4.6v",
        name: "GLM Vision",
        status: "deprecated",
        capabilities: { attachment: true, toolcall: true, input: { image: true } },
        limit: { context: 64000 },
      },
      {
        full: "other/vision-lite",
        providerID: "other",
        modelID: "vision-lite",
        name: "Vision Lite",
        status: "active",
        capabilities: { attachment: true, input: { image: true } },
        limit: { context: 32000 },
      },
    ] as unknown as ReturnType<typeof flattenProviders>;

    const picked = pickVisionModel(candidates);
    expect(picked?.modelID).toBe("vision-lite");
  });

  test("filters configured providers", () => {
    const withApiKey: Provider[] = [
      ...providers,
      buildProvider({
        id: "api-keyed",
        source: "api",
        key: "token",
        models: {
          "api-fast": buildModel({
            id: "api-fast",
            providerID: "api-keyed",
            name: "API Fast",
            capabilities: { input: { text: true, audio: false, image: false, video: false, pdf: false } },
          }),
        },
      }),
    ];
    const filtered = filterProviders(withApiKey, "configured");
    const ids = filtered.map((p) => p.id);
    expect(ids).toContain("opencode");
    expect(ids).toContain("fast-provider");
    expect(ids).toContain("api-keyed");
    expect(ids).not.toContain("api-provider");

    const all = filterProviders(withApiKey, "all");
    expect(all.length).toBe(withApiKey.length);
  });

  test("resolves models via aliases, auto tags, and errors", () => {
    const aliases = { alias: "opencode/gpt-5-nano" };
    const defaults = { opencode: "gpt-5-nano" };
    const selection: OrchestratorConfig["modelSelection"] = {
      mode: "balanced",
      preferredProviders: ["opencode", "fast-provider"],
    };

    const aliasResolved = resolveModel("alias", { providers, aliases });
    expect("error" in aliasResolved).toBe(false);

    const autoResolved = resolveModel("auto", { providers, defaults, selection });
    expect("error" in autoResolved).toBe(false);
    if (!("error" in autoResolved)) {
      expect(autoResolved.full).toBe("opencode/gpt-5-nano");
    }

    const visionResolved = resolveModel("auto:vision", { providers, defaults, selection });
    expect("error" in visionResolved).toBe(false);

    const unknownProvider = resolveModel("missing/gpt", { providers });
    expect("error" in unknownProvider).toBe(true);

    const missingModel = resolveModel("opencode/missing", { providers });
    expect("error" in missingModel).toBe(true);

    const missingExact = resolveModel("unknown-model", { providers });
    expect("error" in missingExact).toBe(true);
  });

  test("resolves additional auto tags and exact matches", () => {
    const defaults = { opencode: "gpt-5-nano" };

    const autoFast = resolveModel("auto:fast", { providers, defaults });
    expect("error" in autoFast).toBe(false);

    const autoDocs = resolveModel("auto:docs", { providers, defaults });
    expect("error" in autoDocs).toBe(false);

    const autoCode = resolveModel("auto:code", { providers, defaults });
    expect("error" in autoCode).toBe(false);

    const autoCheap = resolveModel("auto:cheap", { providers, defaults });
    expect("error" in autoCheap).toBe(false);

    const nodeAuto = resolveModel("node", { providers, defaults });
    expect("error" in nodeAuto).toBe(false);

    const nodeFast = resolveModel("node:fast", { providers, defaults });
    expect("error" in nodeFast).toBe(false);

    const reasoning = resolveModel("auto:reasoning", { providers, defaults });
    expect("error" in reasoning).toBe(false);

    const modelMatches = resolveModel("gpt-5-nano", { providers, selection: { preferredProviders: ["opencode"] } });
    expect("error" in modelMatches).toBe(false);
  });

  test("prefers selected provider when exact matches collide", () => {
    const duplicated: Provider[] = [
      buildProvider({
        id: "primary",
        source: "config",
        models: {
          shared: buildModel({
            id: "shared",
            providerID: "primary",
            name: "Shared",
            capabilities: { input: { text: true, audio: false, image: false, video: false, pdf: false } },
          }),
        },
      }),
      buildProvider({
        id: "secondary",
        source: "config",
        models: {
          shared: buildModel({
            id: "shared",
            providerID: "secondary",
            name: "Shared",
            capabilities: { input: { text: true, audio: false, image: false, video: false, pdf: false } },
          }),
        },
      }),
    ];

    const result = resolveModel("shared", {
      providers: duplicated,
      selection: { preferredProviders: ["secondary"] },
    });

    expect("error" in result).toBe(false);
    if (!("error" in result)) {
      expect(result.providerID).toBe("secondary");
    }
  });

  test("reports auto tag errors with suggestions", () => {
    const simpleProviders: Provider[] = [
      buildProvider({
        id: "provider",
        source: "config",
        models: {
          "basic-model": buildModel({
            id: "basic-model",
            providerID: "provider",
            name: "Basic",
            capabilities: { input: { text: true, audio: false, image: false, video: false, pdf: false } },
          }),
        },
      }),
    ];

    const result = resolveModel("auto:docs", { providers: simpleProviders });
    expect("error" in result).toBe(true);
    if ("error" in result) {
      expect(result.suggestions?.length ?? 0).toBe(0);
    }
  });

  test("handles auto defaults when providers are missing", () => {
    const result = resolveModel("auto", {
      providers,
      defaults: { missing: "model" },
      selection: { preferredProviders: ["missing"] },
    });
    expect("error" in result).toBe(false);
  });

  test("returns suggestions for partial matches", () => {
    const result = resolveModel("gpt", { providers });
    expect("error" in result).toBe(true);
    if ("error" in result) {
      expect(result.suggestions?.length).toBeGreaterThan(0);
    }
  });

  test("resolveModelRef returns error when invalid", () => {
    const ref = resolveModelRef("missing-model", providers);
    expect("error" in ref).toBe(true);
  });

  test("resolveModelRef returns parsed ids when valid", () => {
    const ref = resolveModelRef("opencode/gpt-5-nano", providers);
    expect("error" in ref).toBe(false);
    if (!("error" in ref)) {
      expect(ref.providerID).toBe("opencode");
      expect(ref.modelID).toBe("gpt-5-nano");
    }
  });
});

describe("catalog fetch helpers", () => {
  test("fetches config and providers data", async () => {
    const client = {
      config: {
        get: async () => ({ data: { model: "opencode/gpt-5-nano" } }),
        providers: async () => ({
          data: {
            providers,
            default: { opencode: "gpt-5-nano" },
          },
        }),
      },
    };

    const cfg = await fetchOpencodeConfig(client, "/tmp");
    expect(cfg?.model).toBe("opencode/gpt-5-nano");

    const providerRes = await fetchProviders(client, "/tmp");
    expect(providerRes.providers.length).toBeGreaterThan(0);
    expect(providerRes.defaults.opencode).toBe("gpt-5-nano");
  });

  test("fetchOpencodeConfig returns undefined when request fails", async () => {
    const client = {
      config: {
        get: async () => {
          throw new Error("fail");
        },
        providers: async () => ({ data: {} }),
      },
    };

    const cfg = await fetchOpencodeConfig(client, "/tmp");
    expect(cfg).toBeUndefined();
  });
});

describe("hydrateProfileModelsFromOpencode", () => {
  test("hydrates auto models using defaults", async () => {
    const client = {
      config: {
        get: async () => ({ data: { model: "opencode/gpt-5-nano" } }),
        providers: async () => ({
          data: {
            providers,
            default: { opencode: "gpt-5-nano" },
          },
        }),
      },
    };

    const profiles: Record<string, WorkerProfile> = {
      explorer: {
        id: "explorer",
        name: "Explorer",
        model: "auto",
        purpose: "Explore",
        whenToUse: "explore",
      },
    };

    const result = await hydrateProfileModelsFromOpencode({
      client,
      directory: "/tmp",
      profiles,
      modelAliases: { alias: "opencode/gpt-5-nano" },
    });

    expect(result.profiles.explorer.model).toBe("opencode/gpt-5-nano");
    expect(result.changes.length).toBe(1);
  });

  test("throws when vision profile maps to non-vision model", async () => {
    const client = {
      config: {
        get: async () => ({ data: { model: "fast-provider/fast-mini" } }),
        providers: async () => ({
          data: {
            providers,
            default: { opencode: "gpt-5-nano" },
          },
        }),
      },
    };

    const profiles: Record<string, WorkerProfile> = {
      vision: {
        id: "vision",
        name: "Vision",
        model: "fast-provider/fast-mini",
        purpose: "Vision",
        whenToUse: "vision",
        supportsVision: true,
      },
    };

    await expect(
      hydrateProfileModelsFromOpencode({
        client,
        directory: "/tmp",
        profiles,
      }),
    ).rejects.toThrow("requires vision");
  });

  test("falls back when auto resolution fails", async () => {
    const client = {
      config: {
        get: async () => ({ data: { model: "" } }),
        providers: async () => ({ data: { providers: [], default: {} } }),
      },
    };

    const profiles: Record<string, WorkerProfile> = {
      explorer: {
        id: "explorer",
        name: "Explorer",
        model: "auto:fast",
        purpose: "Explore",
        whenToUse: "explore",
      },
    };

    const result = await hydrateProfileModelsFromOpencode({
      client,
      directory: "/tmp",
      profiles,
    });
    expect(result.fallbackModel).toBe("opencode/gpt-5-nano");
    expect(result.profiles.explorer.model).toBe("opencode/gpt-5-nano");
  });

  test("throws on invalid explicit model with suggestions", async () => {
    const client = {
      config: {
        get: async () => ({ data: { model: "opencode/gpt-5-nano" } }),
        providers: async () => ({
          data: { providers, default: { opencode: "gpt-5-nano" } },
        }),
      },
    };

    const profiles: Record<string, WorkerProfile> = {
      explorer: {
        id: "explorer",
        name: "Explorer",
        model: "bad-model",
        purpose: "Explore",
        whenToUse: "explore",
      },
    };

    await expect(
      hydrateProfileModelsFromOpencode({
        client,
        directory: "/tmp",
        profiles,
      }),
    ).rejects.toThrow('Invalid model for profile "explorer"');
  });
});
