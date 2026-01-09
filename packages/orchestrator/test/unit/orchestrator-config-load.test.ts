import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { loadOrchestratorConfig } from "../../src/config/orchestrator";

describe("loadOrchestratorConfig (project discovery + local overlays)", () => {
  let tmpDir: string;
  let repoRoot: string;
  let nestedDir: string;
  let configHome: string;
  let prevXdgConfigHome: string | undefined;

  beforeAll(async () => {
    prevXdgConfigHome = process.env.XDG_CONFIG_HOME;

    const base = join(process.cwd(), ".tmp");
    await mkdir(base, { recursive: true });
    tmpDir = await mkdtemp(join(base, "orchestrator-config-load-"));

    repoRoot = join(tmpDir, "repo");
    nestedDir = join(repoRoot, "src", "deep");
    configHome = join(tmpDir, "config");

    await Promise.all([
      mkdir(join(repoRoot, ".git"), { recursive: true }),
      mkdir(nestedDir, { recursive: true }),
      mkdir(join(repoRoot, ".opencode"), { recursive: true }),
      mkdir(join(configHome, "opencode"), { recursive: true }),
    ]);

    process.env.XDG_CONFIG_HOME = configHome;

    await writeFile(
      join(configHome, "opencode", "orchestrator.json"),
      JSON.stringify({ autoSpawn: false }, null, 2),
    );

    await writeFile(
      join(repoRoot, ".opencode", "orchestrator.json"),
      JSON.stringify({ autoSpawn: false, ui: { logToConsole: true } }, null, 2),
    );

    await writeFile(
      join(repoRoot, ".opencode", "orchestrator.local.json"),
      JSON.stringify({ autoSpawn: true, ui: { debug: true } }, null, 2),
    );
  });

  afterAll(async () => {
    if (prevXdgConfigHome === undefined)
      process.env.XDG_CONFIG_HOME = undefined;
    else process.env.XDG_CONFIG_HOME = prevXdgConfigHome;
    await rm(tmpDir, { recursive: true, force: true });
  });

  test("walks up to git root and merges .opencode/orchestrator.local.json after project config", async () => {
    const { config, sources } = await loadOrchestratorConfig({
      directory: nestedDir,
    });

    expect(sources.global).toBe(
      join(configHome, "opencode", "orchestrator.json"),
    );
    expect(sources.project).toBe(
      join(repoRoot, ".opencode", "orchestrator.json"),
    );
    expect(sources.projectLocal).toBe(
      join(repoRoot, ".opencode", "orchestrator.local.json"),
    );

    expect(config.autoSpawn).toBe(true);
    expect(config.ui?.logToConsole).toBe(true);
    expect(config.ui?.debug).toBe(true);
  });
});
