import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadOpenCodeConfig, mergeOpenCodeConfig } from "../../src/config/opencode";

describe("opencode config", () => {
  let tempDir = "";
  const originalXdg = process.env.XDG_CONFIG_HOME;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "opencode-config-"));
    process.env.XDG_CONFIG_HOME = tempDir;
  });

  afterEach(async () => {
    if (originalXdg) process.env.XDG_CONFIG_HOME = originalXdg;
    else delete process.env.XDG_CONFIG_HOME;
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true }).catch(() => {});
    }
  });

  const writeConfig = async (payload: unknown) => {
    const configDir = join(tempDir, "opencode");
    await mkdir(configDir, { recursive: true });
    await writeFile(join(configDir, "opencode.json"), JSON.stringify(payload), "utf8");
  };

  test("returns empty object when config is missing", async () => {
    const config = await loadOpenCodeConfig();
    expect(config).toEqual({});
  });

  test("returns empty object when config is invalid JSON", async () => {
    const configDir = join(tempDir, "opencode");
    await mkdir(configDir, { recursive: true });
    await writeFile(join(configDir, "opencode.json"), "{ invalid", "utf8");
    const config = await loadOpenCodeConfig();
    expect(config).toEqual({});
  });

  test("drops orchestrator plugins and appends extra entries", async () => {
    await writeConfig({ plugin: ["keep", "opencode-orchestrator", "orchestrator.js"] });

    const merged = await mergeOpenCodeConfig(undefined, {
      dropOrchestratorPlugin: true,
      appendPlugins: ["extra", "orchestrator.ts"],
    });

    expect(merged.plugin).toEqual(["keep", "extra"]);
  });

  test("returns base config when no override or plugin options are provided", async () => {
    await writeConfig({ model: "base-model", plugin: ["base-plugin"] });

    const merged = await mergeOpenCodeConfig();

    expect(merged).toEqual({ model: "base-model", plugin: ["base-plugin"] });
  });

  test("merges when base config is not a plain object", async () => {
    const merged = await mergeOpenCodeConfig(
      { model: "override", plugin: ["override"] },
      { baseConfig: ["unexpected"], appendPlugins: ["extra"] },
    );

    expect(merged.model).toBe("override");
    expect(merged.plugin).toEqual(["override", "extra"]);
  });

  test("merges override values and plugin list", async () => {
    await writeConfig({ plugin: ["base", "shared"], nested: { a: 1 } });

    const merged = await mergeOpenCodeConfig(
      { plugin: ["override", "shared"], nested: { b: 2 } },
      { appendPlugins: ["append"] },
    );

    expect(merged.plugin).toEqual(["base", "shared", "override", "append"]);
    expect(merged.nested).toEqual({ a: 1, b: 2 });
  });
});
