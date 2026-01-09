import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { mergeOpenCodeConfig } from "../../src/config/opencode";

describe("mergeOpenCodeConfig (global + project + local)", () => {
  let tmpDir: string;
  let repoRoot: string;
  let nestedDir: string;
  let configHome: string;
  let prevXdgConfigHome: string | undefined;

  beforeAll(async () => {
    prevXdgConfigHome = process.env.XDG_CONFIG_HOME;

    const base = join(process.cwd(), ".tmp");
    await mkdir(base, { recursive: true });
    tmpDir = await mkdtemp(join(base, "opencode-config-"));

    repoRoot = join(tmpDir, "repo");
    nestedDir = join(repoRoot, "src");
    configHome = join(tmpDir, "config");

    await Promise.all([
      mkdir(join(repoRoot, ".git"), { recursive: true }),
      mkdir(nestedDir, { recursive: true }),
      mkdir(join(repoRoot, ".opencode"), { recursive: true }),
      mkdir(join(configHome, "opencode"), { recursive: true }),
    ]);

    process.env.XDG_CONFIG_HOME = configHome;

    await writeFile(
      join(configHome, "opencode", "opencode.json"),
      JSON.stringify(
        {
          agent: { leaked: true },
          plugin: ["file:///global.mjs", "file:///orchestrator.mjs"],
          provider: { global: { models: { gpt: {} } } },
        },
        null,
        2,
      ),
    );

    await writeFile(
      join(repoRoot, "opencode.json"),
      JSON.stringify(
        {
          agent: { project: true },
          plugin: ["file:///project.mjs"],
          provider: { project: { models: { p: {} } } },
          model: "project/model",
        },
        null,
        2,
      ),
    );

    await writeFile(
      join(repoRoot, ".opencode", "opencode.local.json"),
      JSON.stringify(
        {
          plugin: ["file:///local.mjs"],
          model: "local/model",
        },
        null,
        2,
      ),
    );
  });

  afterAll(async () => {
    if (prevXdgConfigHome === undefined)
      process.env.XDG_CONFIG_HOME = undefined;
    else process.env.XDG_CONFIG_HOME = prevXdgConfigHome;
    await rm(tmpDir, { recursive: true, force: true });
  });

  test("includes project config and merges plugin list with dropOrchestratorPlugin", async () => {
    const merged = await mergeOpenCodeConfig(
      { plugin: ["file:///override.mjs"] },
      {
        directory: nestedDir,
        dropOrchestratorPlugin: true,
        appendPlugins: ["file:///append.mjs"],
        excludeAgentConfigs: true,
      },
    );

    expect((merged as any).agent).toBeUndefined();
    expect((merged as any).model).toBe("local/model");
    expect(Object.keys((merged as any).provider ?? {})).toEqual([
      "global",
      "project",
    ]);
    expect((merged as any).plugin).toEqual([
      "file:///global.mjs",
      "file:///project.mjs",
      "file:///local.mjs",
      "file:///override.mjs",
      "file:///append.mjs",
    ]);
  });
});
