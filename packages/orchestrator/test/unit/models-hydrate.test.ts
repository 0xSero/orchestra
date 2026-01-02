import { describe, expect, test } from "bun:test";
import type { Config, Provider } from "@opencode-ai/sdk";
import type { WorkerProfile } from "../../src/types";
import { hydrateProfileModelsFromOpencode } from "../../src/models/hydrate";

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

const createClient = (input: {
  config?: Config;
  providersConfig?: Provider[];
  providersList?: Provider[];
}) => {
  return {
    config: {
      get: async () => ({ data: input.config }),
      providers: async () => ({
        data: { providers: input.providersConfig ?? [], default: {} },
      }),
      model: async () => ({ data: {} }),
    },
    provider: {
      list: async () => ({ data: { providers: input.providersList ?? [] } }),
    },
  };
};

describe("hydrateProfileModelsFromOpencode", () => {
  test("prefers cfg.small_model for node:fast tags", async () => {
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

    const client = createClient({
      config: {
        model: "cfg/fast-ultra",
        small_model: "cfg/fast-small",
      } as Config,
      providersConfig: [configured],
      providersList: [configured],
    });

    const profiles: Record<string, WorkerProfile> = {
      fast: {
        id: "fast",
        name: "Fast",
        model: "node:fast",
        purpose: "Test",
        whenToUse: "Test",
      },
    };

    const result = await hydrateProfileModelsFromOpencode({
      client,
      directory: process.cwd(),
      profiles,
    });

    expect(result.profiles.fast.model).toBe("cfg/fast-small");
  });

  test("falls back when cfg.small_model is invalid for node:fast tags", async () => {
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

    const client = createClient({
      config: { model: "cfg/fast-ultra", small_model: "cfg/missing" } as Config,
      providersConfig: [configured],
      providersList: [configured],
    });

    const profiles: Record<string, WorkerProfile> = {
      fast: {
        id: "fast",
        name: "Fast",
        model: "node:fast",
        purpose: "Test",
        whenToUse: "Test",
      },
    };

    const result = await hydrateProfileModelsFromOpencode({
      client,
      directory: process.cwd(),
      profiles,
    });

    expect(result.profiles.fast.model).toBe("cfg/fast-ultra");
  });

  test("includes api providers with key for node:fast tags", async () => {
    const api = makeProvider({
      id: "api",
      source: "api",
      key: "token",
      models: {
        "fast-ultra": {
          name: "fast-ultra",
          limit: { context: 128000, output: 0 },
        },
      },
    });

    const client = createClient({
      providersConfig: [],
      providersList: [api],
    });

    const profiles: Record<string, WorkerProfile> = {
      fast: {
        id: "fast",
        name: "Fast",
        model: "node:fast",
        purpose: "Test",
        whenToUse: "Test",
      },
    };

    const result = await hydrateProfileModelsFromOpencode({
      client,
      directory: process.cwd(),
      profiles,
    });

    expect(result.profiles.fast.model).toBe("api/fast-ultra");
  });

  test("excludes api providers without key for node:fast tags", async () => {
    const configured = makeProvider({
      id: "cfg",
      source: "config",
      models: {
        "steady-large": {
          name: "steady-large",
          cost: { input: 10, output: 0, cache: { read: 0, write: 0 } },
        },
      },
    });
    const api = makeProvider({
      id: "api",
      source: "api",
      models: {
        "fast-ultra": {
          name: "fast-ultra",
          limit: { context: 128000, output: 0 },
        },
      },
    });

    const client = createClient({
      config: { model: "cfg/steady-large" } as Config,
      providersConfig: [configured],
      providersList: [configured, api],
    });

    const profiles: Record<string, WorkerProfile> = {
      fast: {
        id: "fast",
        name: "Fast",
        model: "node:fast",
        purpose: "Test",
        whenToUse: "Test",
      },
    };

    const result = await hydrateProfileModelsFromOpencode({
      client,
      directory: process.cwd(),
      profiles,
    });

    expect(result.profiles.fast.model).toBe("cfg/steady-large");
  });

  test("uses configured providers for node:fast tags", async () => {
    const configured = makeProvider({
      id: "cfg",
      source: "config",
      models: { "fast-small": { name: "fast-small" } },
    });
    const api = makeProvider({
      id: "api",
      source: "api",
      key: "token",
      models: {
        "slow-ultra": {
          name: "slow-ultra",
          cost: { input: 10, output: 0, cache: { read: 0, write: 0 } },
        },
      },
    });

    const client = createClient({
      config: { model: "cfg/fast-small" } as Config,
      providersConfig: [configured],
      providersList: [configured, api],
    });

    const profiles: Record<string, WorkerProfile> = {
      fast: {
        id: "fast",
        name: "Fast",
        model: "node:fast",
        purpose: "Test",
        whenToUse: "Test",
      },
    };

    const result = await hydrateProfileModelsFromOpencode({
      client,
      directory: process.cwd(),
      profiles,
    });

    expect(result.profiles.fast.model).toBe("cfg/fast-small");
  });

  test("accepts explicit api provider models", async () => {
    const configured = makeProvider({
      id: "cfg",
      source: "config",
      models: { "fast-small": { name: "fast-small" } },
    });
    const api = makeProvider({
      id: "api",
      source: "api",
      models: { "fast-ultra": { name: "fast-ultra" } },
    });

    const client = createClient({
      config: { model: "cfg/fast-small" } as Config,
      providersConfig: [configured],
      providersList: [configured, api],
    });

    const profiles: Record<string, WorkerProfile> = {
      fast: {
        id: "fast",
        name: "Fast",
        model: "api/fast-ultra",
        purpose: "Test",
        whenToUse: "Test",
      },
    };

    const result = await hydrateProfileModelsFromOpencode({
      client,
      directory: process.cwd(),
      profiles,
    });

    expect(result.profiles.fast.model).toBe("api/fast-ultra");
  });
});
