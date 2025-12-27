import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadOrchestratorConfig } from "../../src/config/orchestrator";
import { getDefaultGlobalOrchestratorConfigPath } from "../../src/config/orchestrator/paths";

describe("orchestrator config loading", () => {
  let tempDir = "";
  const originalXdg = process.env.XDG_CONFIG_HOME;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "orch-config-"));
    process.env.XDG_CONFIG_HOME = tempDir;
  });

  afterEach(async () => {
    if (originalXdg) process.env.XDG_CONFIG_HOME = originalXdg;
    else delete process.env.XDG_CONFIG_HOME;
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true }).catch(() => {});
    }
  });

  test("loads global orchestrator config when present", async () => {
    const configPath = getDefaultGlobalOrchestratorConfigPath();
    await mkdir(join(tempDir, "opencode"), { recursive: true });
    await writeFile(
      configPath,
      JSON.stringify({
        profiles: [
          {
            id: "alpha",
            name: "Alpha",
            model: "opencode/gpt-5-nano",
            purpose: "Testing",
            whenToUse: "Always",
          },
        ],
      }),
      "utf8",
    );

    const result = await loadOrchestratorConfig({ directory: tempDir });
    expect(result.sources.global).toBe(configPath);
    expect(result.config.profiles.alpha?.id).toBe("alpha");
  });

  test("ignores invalid global config JSON", async () => {
    const configPath = getDefaultGlobalOrchestratorConfigPath();
    await mkdir(join(tempDir, "opencode"), { recursive: true });
    await writeFile(configPath, "{ bad json", "utf8");

    const result = await loadOrchestratorConfig({ directory: tempDir });
    expect(result.sources.global).toBe(configPath);
    expect(Object.keys(result.config.profiles).length).toBe(0);
  });
});
