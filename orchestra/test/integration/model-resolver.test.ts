import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createOpencode, type Provider } from "@opencode-ai/sdk";
import { mergeOpenCodeConfig } from "../../src/config/opencode";
import { type CatalogClient, fetchProviders } from "../../src/models/catalog";
import { resolveModel } from "../../src/models/resolver";
import { setupE2eEnv } from "../helpers/e2e-env";

const MODEL = "opencode/gpt-5-nano";

describe("model resolver (integration)", () => {
  let restoreEnv: (() => void) | undefined;
  let client: CatalogClient;
  let server: { close: () => void } | undefined;
  let providers: Provider[] = [];
  let defaults: Record<string, string> = {};

  beforeAll(async () => {
    const env = await setupE2eEnv();
    restoreEnv = env.restore;

    const config = await mergeOpenCodeConfig({ model: MODEL }, { dropOrchestratorPlugin: true });
    const opencode = await createOpencode({
      hostname: "127.0.0.1",
      port: 0,
      timeout: 60_000,
      config,
    });
    client = opencode.client;
    server = opencode.server;

    const res = await fetchProviders(client, process.cwd());
    providers = res.providers;
    defaults = res.defaults;
  }, 120_000);

  afterAll(() => {
    server?.close();
    restoreEnv?.();
  });

  test("auto:vision returns vision-capable model when available", async () => {
    const resolved = resolveModel("auto:vision", { providers, defaults });
    if ("error" in resolved) {
      expect(resolved.error.toLowerCase()).toContain("auto:vision");
      return;
    }
    expect(resolved.capabilities.supportsVision).toBe(true);
  });

  test("auto:reasoning returns reasoning-capable model when available", async () => {
    const resolved = resolveModel("auto:reasoning", { providers, defaults });
    if ("error" in resolved) {
      expect(resolved.error.toLowerCase()).toContain("auto:reasoning");
      return;
    }
    expect(resolved.capabilities.supportsReasoning).toBe(true);
  });

  test("alias resolves to full model", async () => {
    let fullId: string | undefined;
    for (const provider of providers) {
      const modelIds = Object.keys(provider.models ?? {});
      if (modelIds.length === 0) continue;
      fullId = `${provider.id}/${modelIds[0]}`;
      break;
    }
    if (!fullId) {
      throw new Error("No provider models available for alias test");
    }

    const resolved = resolveModel("alias-test", {
      providers,
      defaults,
      aliases: { "alias-test": fullId },
    });
    expect("error" in resolved).toBe(false);
    if ("error" in resolved) return;
    expect(resolved.full).toBe(fullId);
  });
});
