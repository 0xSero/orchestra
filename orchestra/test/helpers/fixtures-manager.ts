/**
 * Test fixtures management utilities
 *
 * Provides loading, creation, and cleanup of test fixtures including
 * configuration files, worker profiles, and temporary directories.
 */

import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { OrchestratorConfig, WorkerProfile } from "../../src/types";

export interface TestFixtures {
  loadConfig(name: string): Promise<OrchestratorConfig>;
  loadProfile(name: string): Promise<WorkerProfile>;
  createTempDir(): Promise<string>;
  getFixturesDir(): string;
  listConfigs(): Promise<string[]>;
  listProfiles(): Promise<string[]>;
  cleanup(): Promise<void>;
}

export type TestFixturesDeps = {
  existsSync?: typeof existsSync;
  mkdir?: typeof mkdir;
  mkdtemp?: typeof mkdtemp;
  readdir?: typeof readdir;
  readFile?: typeof readFile;
  rm?: typeof rm;
};

export const DEFAULT_TEST_CONFIG: OrchestratorConfig = {
  basePort: 18000,
  profiles: {},
  spawn: [],
  autoSpawn: false,
  spawnOnDemand: [],
  startupTimeout: 120_000,
  healthCheckInterval: 10_000,
  ui: {
    toasts: false,
    injectSystemContext: false,
  },
};

export const DEFAULT_TEST_PROFILE: WorkerProfile = {
  id: "test-worker",
  name: "Test Worker",
  model: "opencode/gpt-5-nano",
  purpose: "Testing purposes",
  whenToUse: "Use for tests only",
  temperature: 0.5,
};

/** Create a test fixtures manager for loading configs, profiles, and temp dirs. */
export function createTestFixtures(deps: TestFixturesDeps = {}): TestFixtures {
  const fixturesDir = resolve(__dirname, "../fixtures");
  const tempDirs: string[] = [];
  const fsDeps = {
    existsSync: deps.existsSync ?? existsSync,
    mkdir: deps.mkdir ?? mkdir,
    mkdtemp: deps.mkdtemp ?? mkdtemp,
    readdir: deps.readdir ?? readdir,
    readFile: deps.readFile ?? readFile,
    rm: deps.rm ?? rm,
  };

  return {
    async loadConfig(name: string): Promise<OrchestratorConfig> {
      const configPath = join(fixturesDir, "orchestrator-configs", `${name}.json`);

      try {
        const content = await fsDeps.readFile(configPath, "utf-8");
        const parsed = JSON.parse(content);

        return {
          ...DEFAULT_TEST_CONFIG,
          ...parsed,
          profiles: {
            ...DEFAULT_TEST_CONFIG.profiles,
            ...parsed.profiles,
          },
          ui: {
            ...DEFAULT_TEST_CONFIG.ui,
            ...parsed.ui,
          },
        };
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") throw new Error(`Config fixture not found: ${name}`);
        throw error;
      }
    },

    async loadProfile(name: string): Promise<WorkerProfile> {
      const profilePath = join(fixturesDir, "profiles", `${name}.json`);

      try {
        const content = await fsDeps.readFile(profilePath, "utf-8");
        const parsed = JSON.parse(content);

        return {
          ...DEFAULT_TEST_PROFILE,
          ...parsed,
        };
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") {
          throw new Error(`Profile fixture not found: ${name}`);
        }
        throw error;
      }
    },

    async createTempDir(): Promise<string> {
      const tempBase = join(process.cwd(), ".tmp");
      await fsDeps.mkdir(tempBase, { recursive: true });

      const tempDir = await fsDeps.mkdtemp(join(tempBase, "test-fixture-"));
      tempDirs.push(tempDir);

      return tempDir;
    },

    getFixturesDir(): string {
      return fixturesDir;
    },

    async listConfigs(): Promise<string[]> {
      const configDir = join(fixturesDir, "orchestrator-configs");

      try {
        const files = await fsDeps.readdir(configDir);
        return files.filter((f) => f.endsWith(".json")).map((f) => f.replace(/\\.json$/, ""));
      } catch {
        return [];
      }
    },

    async listProfiles(): Promise<string[]> {
      const profileDir = join(fixturesDir, "profiles");

      try {
        const files = await fsDeps.readdir(profileDir);
        return files.filter((f) => f.endsWith(".json")).map((f) => f.replace(/\\.json$/, ""));
      } catch {
        return [];
      }
    },

    async cleanup(): Promise<void> {
      const errors: Error[] = [];

      for (const dir of tempDirs) {
        try {
          if (fsDeps.existsSync(dir)) {
            await fsDeps.rm(dir, { recursive: true, force: true });
          }
        } catch (error) {
          errors.push(error as Error);
        }
      }

      tempDirs.length = 0;

      if (errors.length > 0) {
        console.warn(`Fixture cleanup had ${errors.length} errors:`, errors);
      }
    },
  };
}
