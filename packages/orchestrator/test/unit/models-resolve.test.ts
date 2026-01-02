import { describe, expect, test } from "bun:test";
import type { Provider } from "@opencode-ai/sdk";
import { filterProviders, resolveModelRef } from "../../src/models/catalog";

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

describe("filterProviders", () => {
  test("keeps usable providers for configured scope", () => {
    const providers = [
      makeProvider({ id: "opencode", source: "api" }),
      makeProvider({ id: "cfg", source: "config" }),
      makeProvider({ id: "custom", source: "custom" }),
      makeProvider({ id: "env", source: "env" }),
      makeProvider({ id: "api-key", source: "api", key: "token" }),
      makeProvider({ id: "api-no-key", source: "api" }),
    ];

    const filtered = filterProviders(providers, "configured")
      .map((p) => p.id)
      .sort();

    expect(filtered).toEqual(
      ["api-key", "cfg", "custom", "env", "opencode"].sort(),
    );
  });

  test("returns all providers for all scope", () => {
    const providers = [
      makeProvider({ id: "cfg", source: "config" }),
      makeProvider({ id: "api-no-key", source: "api" }),
    ];

    expect(filterProviders(providers, "all").length).toBe(providers.length);
  });
});

describe("resolveModelRef", () => {
  test("returns explicit provider model when it exists", () => {
    const providers = [
      makeProvider({
        id: "api",
        source: "api",
        models: { "gpt-4o": { name: "GPT-4o" } },
      }),
    ];

    const resolved = resolveModelRef("api/gpt-4o", providers);
    if ("error" in resolved) {
      throw new Error(`Expected match, got error: ${resolved.error}`);
    }

    expect(resolved.full).toBe("api/gpt-4o");
  });

  test("prefers configured providers when model ids collide", () => {
    const providers = [
      makeProvider({
        id: "cfg",
        source: "config",
        models: { shared: { name: "Shared" } },
      }),
      makeProvider({
        id: "api",
        source: "api",
        models: { shared: { name: "Shared API" } },
      }),
    ];

    const resolved = resolveModelRef("shared", providers);
    if ("error" in resolved) {
      throw new Error(`Expected match, got error: ${resolved.error}`);
    }

    expect(resolved.full).toBe("cfg/shared");
  });

  test("fuzzy matches versioned ids", () => {
    const providers = [
      makeProvider({
        id: "cfg",
        source: "config",
        models: { "gpt-4o-2024-08-06": { name: "GPT-4o" } },
      }),
    ];

    const resolved = resolveModelRef("gpt-4o", providers);
    if ("error" in resolved) {
      throw new Error(`Expected match, got error: ${resolved.error}`);
    }

    expect(resolved.full).toBe("cfg/gpt-4o-2024-08-06");
  });
});
