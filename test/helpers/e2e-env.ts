/**
 * E2E environment utilities
 *
 * Provides isolated XDG directories for tests and restores env vars on cleanup.
 */

import { copyFile, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

type EnvSnapshot = {
  XDG_CONFIG_HOME?: string;
  XDG_DATA_HOME?: string;
  XDG_STATE_HOME?: string;
  XDG_CACHE_HOME?: string;
  OPENCODE_ORCH_PROJECT_DIR?: string;
};

export type E2eEnv = {
  root: string;
  restore: () => void;
};

async function copyOpenCodeConfig(sourceConfigHome: string | undefined, targetConfigHome: string) {
  const base = sourceConfigHome ?? join(homedir(), ".config");
  const sourceDir = join(base, "opencode");
  if (!existsSync(sourceDir)) return;
  const targetDir = join(targetConfigHome, "opencode");
  await mkdir(targetDir, { recursive: true });

  const opencodePath = join(sourceDir, "opencode.json");
  if (existsSync(opencodePath)) {
    try {
      const raw = await readFile(opencodePath, "utf8");
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      if (parsed && typeof parsed === "object" && Array.isArray(parsed.plugin)) {
        parsed.plugin = parsed.plugin.filter(
          (entry) => typeof entry === "string" && !entry.includes("orchestrator.")
        );
      }
      await writeFile(join(targetDir, "opencode.json"), JSON.stringify(parsed, null, 2));
    } catch {
      await copyFile(opencodePath, join(targetDir, "opencode.json"));
    }
  }

  const files = ["orchestrator.json", "config.json"];
  for (const filename of files) {
    const source = join(sourceDir, filename);
    if (!existsSync(source)) continue;
    await copyFile(source, join(targetDir, filename));
  }
}

export async function setupE2eEnv(): Promise<E2eEnv> {
  const snapshot: EnvSnapshot = {
    XDG_CONFIG_HOME: process.env.XDG_CONFIG_HOME,
    XDG_DATA_HOME: process.env.XDG_DATA_HOME,
    XDG_STATE_HOME: process.env.XDG_STATE_HOME,
    XDG_CACHE_HOME: process.env.XDG_CACHE_HOME,
    OPENCODE_ORCH_PROJECT_DIR: process.env.OPENCODE_ORCH_PROJECT_DIR,
  };

  const base = join(process.cwd(), ".tmp");
  await mkdir(base, { recursive: true });
  const root = await mkdtemp(join(base, "opencode-e2e-"));

  const configDir = join(root, "config");
  const dataDir = join(root, "data");
  const stateDir = join(root, "state");
  const cacheDir = join(root, "cache");

  await Promise.all([
    mkdir(configDir, { recursive: true }),
    mkdir(dataDir, { recursive: true }),
    mkdir(stateDir, { recursive: true }),
    mkdir(cacheDir, { recursive: true }),
  ]);

  process.env.XDG_CONFIG_HOME = configDir;
  process.env.XDG_DATA_HOME = dataDir;
  process.env.XDG_STATE_HOME = stateDir;
  process.env.XDG_CACHE_HOME = cacheDir;
  process.env.OPENCODE_ORCH_PROJECT_DIR = process.cwd();

  await copyOpenCodeConfig(snapshot.XDG_CONFIG_HOME, configDir);

  return {
    root,
    restore: () => {
      if (snapshot.XDG_CONFIG_HOME === undefined) delete process.env.XDG_CONFIG_HOME;
      else process.env.XDG_CONFIG_HOME = snapshot.XDG_CONFIG_HOME;

      if (snapshot.XDG_DATA_HOME === undefined) delete process.env.XDG_DATA_HOME;
      else process.env.XDG_DATA_HOME = snapshot.XDG_DATA_HOME;

      if (snapshot.XDG_STATE_HOME === undefined) delete process.env.XDG_STATE_HOME;
      else process.env.XDG_STATE_HOME = snapshot.XDG_STATE_HOME;

      if (snapshot.XDG_CACHE_HOME === undefined) delete process.env.XDG_CACHE_HOME;
      else process.env.XDG_CACHE_HOME = snapshot.XDG_CACHE_HOME;

      if (snapshot.OPENCODE_ORCH_PROJECT_DIR === undefined) delete process.env.OPENCODE_ORCH_PROJECT_DIR;
      else process.env.OPENCODE_ORCH_PROJECT_DIR = snapshot.OPENCODE_ORCH_PROJECT_DIR;
    },
  };
}
