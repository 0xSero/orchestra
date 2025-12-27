import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadOrchestratorConfig } from "../../src/config/orchestrator";

let tempDir: string;

describe("config auto-spawn", () => {
  beforeAll(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "orch-config-"));
  });

  afterAll(async () => {
    // tmpdir cleanup left to OS
  });

  test("spawn list is only what the user configured", async () => {
    const configDir = join(tempDir, ".opencode");
    await mkdir(configDir, { recursive: true });
    const configPath = join(configDir, "orchestrator.json");

    const config = {
      autoSpawn: true,
      workers: [],
      memory: { enabled: true, autoSpawn: true },
    };

    await writeFile(configPath, JSON.stringify(config, null, 2));

    const loaded = await loadOrchestratorConfig({ directory: tempDir });
    expect(loaded.config.spawn.length).toBe(0);
  });

  test("spawnOnDemand honors explicit config", async () => {
    const configDir = join(tempDir, ".opencode");
    await mkdir(configDir, { recursive: true });
    const configPath = join(configDir, "orchestrator.json");

    const config = {
      spawnOnDemand: ["vision", "docs"],
    };

    await writeFile(configPath, JSON.stringify(config, null, 2));

    const loaded = await loadOrchestratorConfig({ directory: tempDir });
    expect(loaded.config.spawnOnDemand).toEqual(["vision", "docs"]);
  });

  test("spawnPolicy filters auto-spawn, on-demand, and warm pool entries", async () => {
    const configDir = join(tempDir, ".opencode");
    await mkdir(configDir, { recursive: true });
    const configPath = join(configDir, "orchestrator.json");

    const config = {
      workers: ["docs", "vision"],
      spawnOnDemand: ["vision", "docs"],
      warmPool: {
        enabled: true,
        profiles: {
          docs: { size: 1, idleTimeoutMs: 1000 },
          qa: { size: 1, idleTimeoutMs: 1000 },
        },
      },
      spawnPolicy: {
        profiles: {
          vision: { autoSpawn: false, onDemand: false },
          qa: { warmPool: false },
        },
      },
    };

    await writeFile(configPath, JSON.stringify(config, null, 2));

    const loaded = await loadOrchestratorConfig({ directory: tempDir });
    expect(loaded.config.spawn).toEqual(["docs"]);
    expect(loaded.config.spawnOnDemand).toEqual(["docs"]);
    expect(Object.keys(loaded.config.warmPool?.profiles ?? {})).toEqual(["docs"]);
  });
});
