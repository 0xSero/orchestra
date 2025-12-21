import { describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadOrchestratorConfig } from "../src/config/orchestrator";
import { resolveModelRef } from "../src/models/catalog";
import { hydrateProfileModelsFromOpencode } from "../src/models/hydrate";
import { buildPromptParts, extractTextFromPromptResponse } from "../src/workers/prompt";

describe("config loader", () => {
  test("does not turn arrays into objects when merging", async () => {
    const dir = await mkdtemp(join(tmpdir(), "opencode-orch-"));
    const cfgRoot = await mkdtemp(join(tmpdir(), "opencode-config-"));

    const prev = process.env.XDG_CONFIG_HOME;
    process.env.XDG_CONFIG_HOME = cfgRoot;

    try {
      await mkdir(join(cfgRoot, "opencode"), { recursive: true });
      await writeFile(
        join(cfgRoot, "opencode", "orchestrator.json"),
        JSON.stringify({ autoSpawn: true, workers: ["coder"], profiles: [] }, null, 2)
      );

      await mkdir(join(dir, ".opencode"), { recursive: true });
      await writeFile(join(dir, ".opencode", "orchestrator.json"), JSON.stringify({ workers: [] }, null, 2));

      const { config } = await loadOrchestratorConfig({ directory: dir });
      expect(Array.isArray(config.spawn)).toBe(true);
      expect(config.spawn).toEqual(["memory"]);
    } finally {
      process.env.XDG_CONFIG_HOME = prev;
    }
  });
});

describe("prompt helpers", () => {
  test("buildPromptParts attaches images from file path", async () => {
    const dir = await mkdtemp(join(tmpdir(), "opencode-orch-attach-"));
    const imgPath = join(dir, "x.png");
    await writeFile(imgPath, Buffer.from([0, 1, 2, 3, 4]));

    const parts = await buildPromptParts({
      message: "hello",
      attachments: [{ type: "image", path: imgPath }],
    });

    expect(parts[0]).toEqual({ type: "text", text: "hello" });
    expect(parts[1]?.type).toBe("file");
    expect((parts[1] as any).mime).toBe("image/png");
    expect(typeof (parts[1] as any).url).toBe("string");
  });

  test("extractTextFromPromptResponse reads nested text parts", () => {
    const { text } = extractTextFromPromptResponse({
      info: { id: "msg" },
      parts: [{ type: "text", text: "a" }, { type: "text", text: "b" }],
    });
    expect(text).toBe("ab");
  });

  test("extractTextFromPromptResponse returns debug for empty responses", () => {
    const out = extractTextFromPromptResponse({});
    expect(out.text).toBe("");
    expect(out.debug).toBe("no_parts");
  });
});

describe("model resolver", () => {
  test("resolveModelRef respects explicit provider even when other providers have matching models", () => {
    const providers: any[] = [
      {
        id: "local-proxy",
        source: "config",
        models: {
          "local-proxy:claude-opus-4-5-20251101": { name: "Claude Opus 4.5" },
          "local-proxy:claude-opus-4-5-thinking": { name: "Claude Opus 4.5 Thinking" },
          "local-proxy:claude-sonnet-4-5-20250929": { name: "Claude Sonnet 4.5" },
        },
      },
      {
        id: "anthropic",
        source: "api",
        models: {
          "claude-opus-4-5": { name: "Claude Opus 4.5" },
        },
      },
    ];

    // When explicitly specifying "anthropic/...", should use anthropic, not local-proxy
    const res = resolveModelRef("anthropic/claude-opus-4-5", providers as any);
    expect("error" in res).toBe(false);
    if ("error" in res) return;
    expect(res.full).toBe("anthropic/claude-opus-4-5");
    expect(res.providerID).toBe("anthropic");
  });

  test("resolveModelRef fuzzy-matches to configured provider when no explicit provider given", () => {
    const providers: any[] = [
      {
        id: "local-proxy",
        source: "config",
        models: {
          "local-proxy:claude-opus-4-5-20251101": { name: "Claude Opus 4.5" },
        },
      },
    ];

    // When NOT specifying a provider, fuzzy matching should find local-proxy
    const res = resolveModelRef("claude-opus-4-5", providers as any);
    expect("error" in res).toBe(false);
    if ("error" in res) return;
    expect(res.full).toBe("local-proxy/local-proxy:claude-opus-4-5-20251101");
  });

  test("resolveModelRef deterministically breaks ties for short IDs", () => {
    const providers: any[] = [
      { id: "beta", source: "api", models: { "gpt-4": { name: "GPT-4" } } },
      { id: "alpha", source: "api", models: { "gpt-4": { name: "GPT-4" } } },
    ];

    const res = resolveModelRef("gpt-4", providers as any);
    expect("error" in res).toBe(false);
    if ("error" in res) return;
    expect(res.providerID).toBe("alpha");
  });

  test("resolveModelRef prefers config over env over api on ties", () => {
    const providers: any[] = [
      { id: "api", source: "api", models: { "gpt-4": { name: "GPT-4" } } },
      { id: "env", source: "env", models: { "gpt-4": { name: "GPT-4" } } },
      { id: "config", source: "config", models: { "gpt-4": { name: "GPT-4" } } },
    ];

    const res = resolveModelRef("gpt-4", providers as any);
    expect("error" in res).toBe(false);
    if ("error" in res) return;
    expect(res.providerID).toBe("config");
  });

  test("resolveModelRef returns unknown provider error for explicit provider", () => {
    const providers: any[] = [
      { id: "anthropic", source: "api", models: { "claude-3": { name: "Claude 3" } } },
    ];
    const res = resolveModelRef("openai/gpt-4", providers as any);
    expect("error" in res).toBe(true);
    if ("error" in res) {
      expect(res.error).toContain("Unknown provider");
    }
  });

  test("resolveModelRef ties in fuzzy match are deterministic", () => {
    const providers: any[] = [
      { id: "b-provider", source: "api", models: { "foo-1": { name: "Foo" } } },
      { id: "a-provider", source: "api", models: { "foo-2": { name: "Foo" } } },
    ];
    const res = resolveModelRef("foo", providers as any);
    expect("error" in res).toBe(false);
    if ("error" in res) return;
    expect(res.providerID).toBe("a-provider");
  });

  test("resolveModelRef respects explicit provider for full IDs", () => {
    const providers: any[] = [
      { id: "api", source: "api", models: { "x-1": { name: "X" } } },
      { id: "config", source: "config", models: { "x-1": { name: "X" } } },
    ];
    const res = resolveModelRef("api/x-1", providers as any);
    expect("error" in res).toBe(false);
    if ("error" in res) return;
    expect(res.providerID).toBe("api");
  });
});

describe("model nodes", () => {
  test("node:vision picks a vision-capable model from usable providers", async () => {
    const providers: any[] = [
      {
        id: "local-proxy",
        source: "config",
        models: {
          "local-proxy:text-only": { capabilities: { attachment: false, input: { image: false } } },
          "local-proxy:vision-1": { capabilities: { attachment: true, input: { image: true } } },
        },
      },
      {
        id: "anthropic",
        source: "api",
        models: {
          "claude-vision-in-api": { capabilities: { attachment: true, input: { image: true } } },
        },
      },
    ];

    const client: any = {
      config: {
        get: async () => ({ data: { model: "opencode/gpt-5-nano" } }),
        providers: async () => ({ data: { providers, default: {} } }),
      },
    };

    const out = await hydrateProfileModelsFromOpencode({
      client,
      directory: process.cwd(),
      profiles: {
        vision: {
          id: "vision",
          name: "Vision",
          model: "node:vision",
          purpose: "p",
          whenToUse: "w",
          supportsVision: true,
        },
      },
    });

    expect(out.profiles.vision.model).toBe("local-proxy/local-proxy:vision-1");
  });

  test("node:vision allows opencode provider even if source is api", async () => {
    const providers: any[] = [
      {
        id: "opencode",
        source: "api",
        models: {
          "gpt-5-vision": { capabilities: { attachment: true, input: { image: true } } },
        },
      },
    ];

    const client: any = {
      config: {
        get: async () => ({ data: { model: "opencode/gpt-5-nano" } }),
        providers: async () => ({ data: { providers, default: {} } }),
      },
    };

    const out = await hydrateProfileModelsFromOpencode({
      client,
      directory: process.cwd(),
      profiles: {
        vision: {
          id: "vision",
          name: "Vision",
          model: "node:vision",
          purpose: "p",
          whenToUse: "w",
          supportsVision: true,
        },
      },
    });

    expect(out.profiles.vision.model).toBe("opencode/gpt-5-vision");
  });

  test("node:vision fails when no vision-capable models are available", async () => {
    const providers: any[] = [
      {
        id: "local-proxy",
        source: "config",
        models: {
          "local-proxy:text-only": { capabilities: { attachment: false, input: { image: false } } },
        },
      },
    ];

    const client: any = {
      config: {
        get: async () => ({ data: { model: "opencode/gpt-5-nano" } }),
        providers: async () => ({ data: { providers, default: {} } }),
      },
    };

    await expect(
      hydrateProfileModelsFromOpencode({
        client,
        directory: process.cwd(),
        profiles: {
          vision: {
            id: "vision",
            name: "Vision",
            model: "node:vision",
            purpose: "p",
            whenToUse: "w",
            supportsVision: true,
          },
        },
      })
    ).rejects.toThrow(/No vision-capable models/i);
  });

  test("vision-capable profiles reject explicit text-only models", async () => {
    const providers: any[] = [
      {
        id: "local-proxy",
        source: "config",
        models: {
          "local-proxy:text-only": { capabilities: { attachment: false, input: { image: false } } },
        },
      },
    ];

    const client: any = {
      config: {
        get: async () => ({ data: { model: "opencode/gpt-5-nano" } }),
        providers: async () => ({ data: { providers, default: {} } }),
      },
    };

    await expect(
      hydrateProfileModelsFromOpencode({
        client,
        directory: process.cwd(),
        profiles: {
          vision: {
            id: "vision",
            name: "Vision",
            model: "local-proxy/local-proxy:text-only",
            purpose: "p",
            whenToUse: "w",
            supportsVision: true,
          },
        },
      })
    ).rejects.toThrow(/requires vision/i);
  });
});
