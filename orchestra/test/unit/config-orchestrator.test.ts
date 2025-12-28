import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadOrchestratorConfig } from "../../src/config/orchestrator";
import {
  getDefaultGlobalOpenCodeConfigPath,
  getDefaultGlobalOrchestratorConfigPath,
  getDefaultProjectOrchestratorConfigPath,
} from "../../src/config/orchestrator/paths";

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
    expect(Object.keys(result.config.profiles).length).toBeGreaterThan(0);
    expect(result.config.profiles["glm47-vision-demo"]?.id).toBe("glm47-vision-demo");
  });

  test("loads project orchestrator config and filters warm pool profiles", async () => {
    const projectPath = getDefaultProjectOrchestratorConfigPath(tempDir);
    await mkdir(join(tempDir, ".opencode"), { recursive: true });
    await writeFile(
      projectPath,
      JSON.stringify({
        profiles: [
          {
            id: "alpha",
            name: "Alpha",
            model: "opencode/gpt-5-nano",
            purpose: "Testing",
            whenToUse: "Always",
          },
          {
            id: "beta",
            name: "Beta",
            model: "opencode/gpt-5-nano",
            purpose: "Testing",
            whenToUse: "Always",
          },
        ],
        warmPool: {
          enabled: true,
          profiles: {
            alpha: { size: 1 },
            beta: { size: 2 },
          },
        },
        spawnPolicy: {
          default: {
            warmPool: true,
          },
          profiles: {
            beta: { warmPool: false },
          },
        },
      }),
      "utf8",
    );

    const result = await loadOrchestratorConfig({ directory: tempDir });
    expect(result.sources.project).toBe(projectPath);
    expect(result.config.warmPool?.profiles?.alpha?.size).toBe(1);
    expect(result.config.warmPool?.profiles?.beta).toBeUndefined();
  });

  test("ignores invalid project config JSON", async () => {
    const projectPath = getDefaultProjectOrchestratorConfigPath(tempDir);
    await mkdir(join(tempDir, ".opencode"), { recursive: true });
    await writeFile(projectPath, "{ bad json", "utf8");

    const result = await loadOrchestratorConfig({ directory: tempDir });
    expect(result.sources.project).toBe(projectPath);
    expect(Object.keys(result.config.profiles).length).toBeGreaterThan(0);
  });

  test("loads health check settings from project config", async () => {
    const projectPath = getDefaultProjectOrchestratorConfigPath(tempDir);
    await mkdir(join(tempDir, ".opencode"), { recursive: true });
    await writeFile(
      projectPath,
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
        healthCheckInterval: 12345,
        healthCheck: { enabled: false, intervalMs: 100, timeoutMs: 200, maxRetries: 2 },
      }),
      "utf8",
    );

    const result = await loadOrchestratorConfig({ directory: tempDir });
    expect(result.sources.project).toBe(projectPath);
    expect(result.config.healthCheckInterval).toBe(12345);
    expect(result.config.healthCheck?.enabled).toBe(false);
    expect(result.config.healthCheck?.maxRetries).toBe(2);
  });

  test("merges opencode integrations with orchestrator overrides", async () => {
    const openCodePath = getDefaultGlobalOpenCodeConfigPath();
    await mkdir(join(tempDir, "opencode"), { recursive: true });
    await writeFile(
      openCodePath,
      JSON.stringify({
        integrations: { linear: { apiKey: "open-key" } },
      }),
      "utf8",
    );

    const projectPath = getDefaultProjectOrchestratorConfigPath(tempDir);
    await mkdir(join(tempDir, ".opencode"), { recursive: true });
    await writeFile(
      projectPath,
      JSON.stringify({
        integrations: { linear: { teamId: "team-1" } },
      }),
      "utf8",
    );

    const result = await loadOrchestratorConfig({ directory: tempDir });
    expect(result.config.integrations?.linear?.apiKey).toBe("open-key");
    expect(result.config.integrations?.linear?.teamId).toBe("team-1");
  });

  test("filters spawn list by spawn policy", async () => {
    const projectPath = getDefaultProjectOrchestratorConfigPath(tempDir);
    await mkdir(join(tempDir, ".opencode"), { recursive: true });
    await writeFile(
      projectPath,
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
        workers: ["alpha"],
        spawnPolicy: {
          default: {
            autoSpawn: true,
          },
        },
      }),
      "utf8",
    );

    const result = await loadOrchestratorConfig({ directory: tempDir });
    expect(result.config.spawn).toEqual(["alpha"]);
  });
});
