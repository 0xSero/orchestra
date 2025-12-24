/**
 * Test fixtures management utilities
 * 
 * Provides loading, creation, and cleanup of test fixtures including
 * configuration files, worker profiles, and temporary directories.
 */

import { readFile, readdir, mkdir, rm, mkdtemp } from "node:fs/promises";
import { join, resolve } from "node:path";
import { existsSync } from "node:fs";
import type { OrchestratorConfig, WorkerProfile } from "../../src/types";

/**
 * Fixture manager for loading and managing test fixtures
 */
export interface TestFixtures {
  /**
   * Load an orchestrator configuration from fixtures
   * @param name - Name of the config file (without .json extension)
   */
  loadConfig(name: string): Promise<OrchestratorConfig>;

  /**
   * Load a worker profile from fixtures
   * @param name - Name of the profile file (without .json extension)
   */
  loadProfile(name: string): Promise<WorkerProfile>;

  /**
   * Create a temporary directory for test use
   * @returns Path to the created directory
   */
  createTempDir(): Promise<string>;

  /**
   * Get the fixtures base directory path
   */
  getFixturesDir(): string;

  /**
   * List all available config fixtures
   */
  listConfigs(): Promise<string[]>;

  /**
   * List all available profile fixtures
   */
  listProfiles(): Promise<string[]>;

  /**
   * Cleanup all created temporary directories
   */
  cleanup(): Promise<void>;
}

/**
 * Default configuration values for testing
 */
export const DEFAULT_TEST_CONFIG: OrchestratorConfig = {
  basePort: 18000,
  profiles: {},
  spawn: [],
  autoSpawn: false,
  spawnOnDemand: [],
  startupTimeout: 30_000,
  healthCheckInterval: 10_000,
  ui: {
    toasts: false,
    injectSystemContext: false,
  },
};

/**
 * Default worker profile for testing
 */
export const DEFAULT_TEST_PROFILE: WorkerProfile = {
  id: "test-worker",
  name: "Test Worker",
  model: "opencode/gpt-5-nano",
  purpose: "Testing purposes",
  whenToUse: "Use for tests only",
  temperature: 0.5,
};

/**
 * Create a test fixtures manager
 * 
 * @example
 * ```typescript
 * const fixtures = createTestFixtures();
 * 
 * // Load a config
 * const config = await fixtures.loadConfig('default');
 * 
 * // Create a temp dir for test files
 * const tempDir = await fixtures.createTempDir();
 * 
 * // Cleanup after test
 * await fixtures.cleanup();
 * ```
 */
export function createTestFixtures(): TestFixtures {
  const fixturesDir = resolve(__dirname, "../fixtures");
  const tempDirs: string[] = [];

  return {
    async loadConfig(name: string): Promise<OrchestratorConfig> {
      const configPath = join(fixturesDir, "orchestrator-configs", `${name}.json`);
      
      try {
        const content = await readFile(configPath, "utf-8");
        const parsed = JSON.parse(content);
        
        // Merge with defaults to ensure all required fields exist
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
        if ((error as NodeJS.ErrnoException).code === "ENOENT") {
          throw new Error(`Config fixture not found: ${name}`);
        }
        throw error;
      }
    },

    async loadProfile(name: string): Promise<WorkerProfile> {
      const profilePath = join(fixturesDir, "profiles", `${name}.json`);
      
      try {
        const content = await readFile(profilePath, "utf-8");
        const parsed = JSON.parse(content);
        
        // Merge with defaults to ensure all required fields exist
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
      await mkdir(tempBase, { recursive: true });
      
      const tempDir = await mkdtemp(join(tempBase, "test-fixture-"));
      tempDirs.push(tempDir);
      
      return tempDir;
    },

    getFixturesDir(): string {
      return fixturesDir;
    },

    async listConfigs(): Promise<string[]> {
      const configDir = join(fixturesDir, "orchestrator-configs");
      
      try {
        const files = await readdir(configDir);
        return files
          .filter((f) => f.endsWith(".json"))
          .map((f) => f.replace(/\.json$/, ""));
      } catch {
        return [];
      }
    },

    async listProfiles(): Promise<string[]> {
      const profileDir = join(fixturesDir, "profiles");
      
      try {
        const files = await readdir(profileDir);
        return files
          .filter((f) => f.endsWith(".json"))
          .map((f) => f.replace(/\.json$/, ""));
      } catch {
        return [];
      }
    },

    async cleanup(): Promise<void> {
      const errors: Error[] = [];
      
      for (const dir of tempDirs) {
        try {
          if (existsSync(dir)) {
            await rm(dir, { recursive: true, force: true });
          }
        } catch (error) {
          errors.push(error as Error);
        }
      }
      
      // Clear the array
      tempDirs.length = 0;
      
      if (errors.length > 0) {
        console.warn(`Fixture cleanup had ${errors.length} errors:`, errors);
      }
    },
  };
}

/**
 * Create a test worker profile with custom overrides
 * 
 * @param id - Profile ID
 * @param overrides - Optional overrides for profile properties
 * @returns A complete WorkerProfile
 * 
 * @example
 * ```typescript
 * const profile = createTestProfile('my-worker', {
 *   model: 'anthropic/claude-sonnet-4',
 *   purpose: 'Code review',
 * });
 * ```
 */
export function createTestProfile(
  id: string,
  overrides?: Partial<WorkerProfile>
): WorkerProfile {
  return {
    ...DEFAULT_TEST_PROFILE,
    id,
    name: `Test ${id}`,
    ...overrides,
  };
}

/**
 * Create a test configuration with custom overrides
 * 
 * @param overrides - Optional overrides for config properties
 * @returns A complete OrchestratorConfig
 * 
 * @example
 * ```typescript
 * const config = createTestConfig({
 *   basePort: 19000,
 *   autoSpawn: true,
 * });
 * ```
 */
export function createTestConfig(
  overrides?: Partial<OrchestratorConfig>
): OrchestratorConfig {
  return {
    ...DEFAULT_TEST_CONFIG,
    ...overrides,
    profiles: {
      ...DEFAULT_TEST_CONFIG.profiles,
      ...overrides?.profiles,
    },
    ui: {
      ...DEFAULT_TEST_CONFIG.ui,
      ...overrides?.ui,
    },
  };
}

/**
 * Provider scenario types for mock testing
 */
export type ProviderScenario =
  | "single-provider"
  | "multi-provider-conflict"
  | "vision-capable"
  | "no-credentials"
  | "tied-scores"
  | "deprecated-models";

/**
 * Create mock providers for different test scenarios
 * 
 * @param scenario - The provider scenario to create
 * @returns Array of mock provider configurations
 */
export function createMockProviders(scenario: ProviderScenario): Array<{
  id: string;
  source: string;
  key?: string;
  models: Record<string, unknown>;
}> {
  switch (scenario) {
    case "single-provider":
      return [
        {
          id: "local-proxy",
          source: "config",
          models: {
            "test-model": {
              id: "test-model",
              name: "Test Model",
              capabilities: { input: { text: true } },
            },
          },
        },
      ];

    case "multi-provider-conflict":
      return [
        {
          id: "anthropic",
          source: "api",
          key: "test-key-1",
          models: {
            "claude-sonnet": {
              id: "claude-sonnet",
              name: "Claude Sonnet",
              capabilities: { input: { text: true } },
            },
          },
        },
        {
          id: "local-proxy",
          source: "config",
          models: {
            "claude-sonnet": {
              id: "claude-sonnet",
              name: "Claude Sonnet (Proxy)",
              capabilities: { input: { text: true } },
            },
          },
        },
      ];

    case "vision-capable":
      return [
        {
          id: "vision-provider",
          source: "api",
          key: "test-key",
          models: {
            "vision-1": {
              id: "vision-1",
              name: "Vision Model",
              capabilities: {
                input: { text: true, image: true },
              },
            },
          },
        },
      ];

    case "no-credentials":
      return [
        {
          id: "anthropic",
          source: "api",
          key: undefined,
          models: {
            "claude-sonnet": {
              id: "claude-sonnet",
              name: "Claude Sonnet",
            },
          },
        },
      ];

    case "tied-scores":
      return [
        {
          id: "provider-a",
          source: "config",
          models: {
            "model-a": {
              id: "model-a",
              name: "Model A",
              score: 100,
            },
            "model-b": {
              id: "model-b",
              name: "Model B",
              score: 100,
            },
          },
        },
      ];

    case "deprecated-models":
      return [
        {
          id: "provider",
          source: "api",
          key: "test-key",
          models: {
            "old-model": {
              id: "old-model",
              name: "Old Model",
              deprecated: true,
            },
            "new-model": {
              id: "new-model",
              name: "New Model",
              deprecated: false,
            },
          },
        },
      ];

    default:
      throw new Error(`Unknown provider scenario: ${scenario}`);
  }
}

/**
 * Create mock job entries for testing job registry
 * 
 * @param count - Number of jobs to create
 * @param options - Optional configuration
 * @returns Array of mock job entries
 */
export function createMockJobs(
  count: number,
  options?: {
    completed?: boolean;
    olderThanHours?: number;
  }
): Array<{
  id: string;
  workerId: string;
  task: string;
  status: "pending" | "running" | "completed" | "failed";
  createdAt: string;
  completedAt?: string;
  result?: string;
}> {
  const jobs: Array<{
    id: string;
    workerId: string;
    task: string;
    status: "pending" | "running" | "completed" | "failed";
    createdAt: string;
    completedAt?: string;
    result?: string;
  }> = [];

  const now = new Date();
  const hoursOffset = options?.olderThanHours ?? 0;

  for (let i = 0; i < count; i++) {
    const createdAt = new Date(
      now.getTime() - (hoursOffset + i) * 60 * 60 * 1000
    );

    const job: {
      id: string;
      workerId: string;
      task: string;
      status: "pending" | "running" | "completed" | "failed";
      createdAt: string;
      completedAt?: string;
      result?: string;
    } = {
      id: `job-${i}`,
      workerId: `worker-${i % 3}`,
      task: `Test task ${i}`,
      status: options?.completed ? "completed" : "pending",
      createdAt: createdAt.toISOString(),
    };

    if (options?.completed) {
      job.completedAt = new Date(
        createdAt.getTime() + 5000
      ).toISOString();
      job.result = `Result for task ${i}`;
    }

    jobs.push(job);
  }

  return jobs;
}
