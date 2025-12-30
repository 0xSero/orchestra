/**
 * Enhanced E2E test environment utilities
 * 
 * Provides isolated test environments with XDG directory overrides,
 * metrics collection integration, worker lifecycle hooks, and cleanup handling.
 */

import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { existsSync } from "node:fs";
import { createMetricsCollector, type MetricsCollector } from "./metrics";
import { createCleanupManager, type CleanupManager } from "./cleanup";
import { createTestFixtures, type TestFixtures } from "./fixtures";

/**
 * Snapshot of environment variables for restoration
 */
type EnvSnapshot = {
  XDG_CONFIG_HOME?: string;
  XDG_DATA_HOME?: string;
  XDG_STATE_HOME?: string;
  XDG_CACHE_HOME?: string;
};

/**
 * Worker lifecycle event types
 */
export type WorkerLifecycleEvent = 
  | "spawning"
  | "spawned"
  | "ready"
  | "busy"
  | "stopping"
  | "stopped"
  | "error";

/**
 * Worker lifecycle hook function
 */
export type WorkerLifecycleHook = (
  event: WorkerLifecycleEvent,
  workerId: string,
  details?: Record<string, unknown>
) => void | Promise<void>;

/**
 * E2E environment options
 */
export interface E2eEnvOptions {
  /** Enable metrics collection (default: false) */
  metrics?: boolean;
  /** Metrics sampling interval in ms (default: 1000) */
  metricsSampleInterval?: number;
  /** Enable automatic cleanup on restore (default: true) */
  autoCleanup?: boolean;
  /** Worker lifecycle hooks */
  lifecycleHooks?: WorkerLifecycleHook[];
  /** Directory prefix for temp directories (default: "opencode-e2e-") */
  dirPrefix?: string;
}

/**
 * E2E environment instance
 */
export interface E2eEnv {
  /** Root directory for this environment */
  root: string;
  /** Config directory (XDG_CONFIG_HOME) */
  configDir: string;
  /** Data directory (XDG_DATA_HOME) */
  dataDir: string;
  /** State directory (XDG_STATE_HOME) */
  stateDir: string;
  /** Cache directory (XDG_CACHE_HOME) */
  cacheDir: string;
  /** Metrics collector (if enabled) */
  metrics?: MetricsCollector;
  /** Cleanup manager */
  cleanup: CleanupManager;
  /** Test fixtures manager */
  fixtures: TestFixtures;
  /** Restore environment and cleanup */
  restore: () => Promise<void>;
  /** Register a worker for lifecycle tracking */
  registerWorker: (workerId: string, pid: number) => void;
  /** Emit a lifecycle event */
  emitLifecycleEvent: (
    event: WorkerLifecycleEvent,
    workerId: string,
    details?: Record<string, unknown>
  ) => Promise<void>;
  /** Get all timing data collected */
  getTimings: () => TimingData;
  /** Start timing an operation */
  startTiming: (name: string) => () => void;
  /** Write a file to the config directory */
  writeConfig: (relativePath: string, content: string) => Promise<string>;
  /** Write a file to the data directory */
  writeData: (relativePath: string, content: string) => Promise<string>;
}

/**
 * Timing data collected during test execution
 */
export interface TimingData {
  /** Operation timings by name */
  operations: Record<string, number[]>;
  /** Total test duration */
  totalDurationMs: number;
  /** Start timestamp */
  startedAt: number;
  /** End timestamp (0 if still running) */
  endedAt: number;
}

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

/**
 * Original setupE2eEnv function for backwards compatibility
 */
export async function setupE2eEnv() {
  const snapshot: EnvSnapshot = {
    XDG_CONFIG_HOME: process.env.XDG_CONFIG_HOME,
    XDG_DATA_HOME: process.env.XDG_DATA_HOME,
    XDG_STATE_HOME: process.env.XDG_STATE_HOME,
    XDG_CACHE_HOME: process.env.XDG_CACHE_HOME,
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
  await copyOpenCodeConfig(snapshot.XDG_CONFIG_HOME, configDir);

  return {
    root,
    restore: () => {
      if (snapshot.XDG_CONFIG_HOME === undefined) process.env.XDG_CONFIG_HOME = undefined;
      else process.env.XDG_CONFIG_HOME = snapshot.XDG_CONFIG_HOME;

      if (snapshot.XDG_DATA_HOME === undefined) process.env.XDG_DATA_HOME = undefined;
      else process.env.XDG_DATA_HOME = snapshot.XDG_DATA_HOME;

      if (snapshot.XDG_STATE_HOME === undefined) process.env.XDG_STATE_HOME = undefined;
      else process.env.XDG_STATE_HOME = snapshot.XDG_STATE_HOME;

      if (snapshot.XDG_CACHE_HOME === undefined) process.env.XDG_CACHE_HOME = undefined;
      else process.env.XDG_CACHE_HOME = snapshot.XDG_CACHE_HOME;
    },
  };
}

/**
 * Create an enhanced E2E test environment with metrics and cleanup
 * 
 * @param options - Environment options
 * @returns E2E environment instance
 * 
 * @example
 * ```typescript
 * const env = await createE2eEnv({
 *   metrics: true,
 *   lifecycleHooks: [
 *     (event, workerId) => console.log(`Worker ${workerId}: ${event}`)
 *   ]
 * });
 * 
 * try {
 *   // Test code...
 *   const endTiming = env.startTiming('spawn-worker');
 *   const worker = await spawnWorker(profile);
 *   endTiming();
 *   
 *   env.registerWorker(worker.profile.id, worker.pid!);
 *   await env.emitLifecycleEvent('ready', worker.profile.id);
 *   
 * } finally {
 *   const timings = env.getTimings();
 *   console.log(`Total duration: ${timings.totalDurationMs}ms`);
 *   await env.restore();
 * }
 * ```
 */
export async function createE2eEnv(options?: E2eEnvOptions): Promise<E2eEnv> {
  const {
    metrics: enableMetrics = false,
    metricsSampleInterval = 1000,
    autoCleanup = true,
    lifecycleHooks = [],
    dirPrefix = "opencode-e2e-",
  } = options ?? {};

  // Snapshot environment
  const snapshot: EnvSnapshot = {
    XDG_CONFIG_HOME: process.env.XDG_CONFIG_HOME,
    XDG_DATA_HOME: process.env.XDG_DATA_HOME,
    XDG_STATE_HOME: process.env.XDG_STATE_HOME,
    XDG_CACHE_HOME: process.env.XDG_CACHE_HOME,
  };

  // Create directories
  const base = join(process.cwd(), ".tmp");
  await mkdir(base, { recursive: true });
  const root = await mkdtemp(join(base, dirPrefix));

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

  // Set environment
  process.env.XDG_CONFIG_HOME = configDir;
  process.env.XDG_DATA_HOME = dataDir;
  process.env.XDG_STATE_HOME = stateDir;
  process.env.XDG_CACHE_HOME = cacheDir;
  await copyOpenCodeConfig(snapshot.XDG_CONFIG_HOME, configDir);

  // Initialize helpers
  const cleanup = createCleanupManager();
  cleanup.registerDirectory(root);

  const fixtures = createTestFixtures();

  // Metrics collection
  const metrics = enableMetrics
    ? createMetricsCollector({ sampleIntervalMs: metricsSampleInterval })
    : undefined;

  if (metrics) {
    metrics.start();
  }

  // Timing data
  const timingData: TimingData = {
    operations: {},
    totalDurationMs: 0,
    startedAt: Date.now(),
    endedAt: 0,
  };

  // Worker tracking
  const workers = new Map<string, { pid: number; registeredAt: number }>();

  const env: E2eEnv = {
    root,
    configDir,
    dataDir,
    stateDir,
    cacheDir,
    metrics,
    cleanup,
    fixtures,

    async restore() {
      // Stop metrics collection
      if (metrics) {
        metrics.stop();
      }

      // Record end time
      timingData.endedAt = Date.now();
      timingData.totalDurationMs = timingData.endedAt - timingData.startedAt;

      // Cleanup if enabled
      if (autoCleanup) {
        await cleanup.cleanupAll();
        await fixtures.cleanup();

        // Remove root directory
        if (existsSync(root)) {
          await rm(root, { recursive: true, force: true }).catch(() => {});
        }
      }

      // Restore environment
      if (snapshot.XDG_CONFIG_HOME === undefined) {
        process.env.XDG_CONFIG_HOME = undefined;
      } else {
        process.env.XDG_CONFIG_HOME = snapshot.XDG_CONFIG_HOME;
      }

      if (snapshot.XDG_DATA_HOME === undefined) {
        process.env.XDG_DATA_HOME = undefined;
      } else {
        process.env.XDG_DATA_HOME = snapshot.XDG_DATA_HOME;
      }

      if (snapshot.XDG_STATE_HOME === undefined) {
        process.env.XDG_STATE_HOME = undefined;
      } else {
        process.env.XDG_STATE_HOME = snapshot.XDG_STATE_HOME;
      }

      if (snapshot.XDG_CACHE_HOME === undefined) {
        process.env.XDG_CACHE_HOME = undefined;
      } else {
        process.env.XDG_CACHE_HOME = snapshot.XDG_CACHE_HOME;
      }
    },

    registerWorker(workerId: string, pid: number) {
      workers.set(workerId, { pid, registeredAt: Date.now() });
      cleanup.registerWorker(pid);
    },

    async emitLifecycleEvent(
      event: WorkerLifecycleEvent,
      workerId: string,
      details?: Record<string, unknown>
    ) {
      // Record timing for spawn events
      if (event === "ready" && workers.has(workerId)) {
        const worker = workers.get(workerId)!;
        const spawnDuration = Date.now() - worker.registeredAt;
        if (metrics) {
          metrics.recordSpawnLatency(spawnDuration);
        }
      }

      // Call lifecycle hooks
      for (const hook of lifecycleHooks) {
        try {
          const result = hook(event, workerId, details);
          if (result instanceof Promise) {
            await result;
          }
        } catch (error) {
          console.warn(`Lifecycle hook error for ${event}:`, error);
          if (metrics) {
            metrics.recordError(`Lifecycle hook error: ${(error as Error).message}`);
          }
        }
      }
    },

    getTimings(): TimingData {
      const now = Date.now();
      return {
        ...timingData,
        totalDurationMs: timingData.endedAt > 0
          ? timingData.totalDurationMs
          : now - timingData.startedAt,
        endedAt: timingData.endedAt > 0 ? timingData.endedAt : now,
      };
    },

    startTiming(name: string): () => void {
      const startTime = performance.now();

      return () => {
        const duration = performance.now() - startTime;
        if (!timingData.operations[name]) {
          timingData.operations[name] = [];
        }
        timingData.operations[name].push(duration);

        // Also record in metrics if enabled
        if (metrics) {
          const endSpan = metrics.startSpan(name);
          // Immediately end since we already have the duration
          endSpan();
        }
      };
    },

    async writeConfig(relativePath: string, content: string): Promise<string> {
      const fullPath = join(configDir, relativePath);
      const dir = join(fullPath, "..");
      await mkdir(dir, { recursive: true });
      await writeFile(fullPath, content, "utf-8");
      cleanup.registerFile(fullPath);
      return fullPath;
    },

    async writeData(relativePath: string, content: string): Promise<string> {
      const fullPath = join(dataDir, relativePath);
      const dir = join(fullPath, "..");
      await mkdir(dir, { recursive: true });
      await writeFile(fullPath, content, "utf-8");
      cleanup.registerFile(fullPath);
      return fullPath;
    },
  };

  return env;
}

/**
 * Create a minimal test environment without full E2E setup
 * 
 * Useful for unit/integration tests that need isolated directories
 * but don't need the full E2E infrastructure.
 */
export async function createTestEnv(): Promise<{
  root: string;
  cleanup: () => Promise<void>;
}> {
  const base = join(process.cwd(), ".tmp");
  await mkdir(base, { recursive: true });
  const root = await mkdtemp(join(base, "test-"));

  return {
    root,
    async cleanup() {
      if (existsSync(root)) {
        await rm(root, { recursive: true, force: true });
      }
    },
  };
}

/**
 * Run a test with automatic E2E environment setup and teardown
 * 
 * @param options - Environment options
 * @param testFn - Test function to run
 * 
 * @example
 * ```typescript
 * await withE2eEnv({ metrics: true }, async (env) => {
 *   const worker = await spawnWorker(profile);
 *   env.registerWorker(worker.profile.id, worker.pid!);
 *   // ... test code ...
 * });
 * ```
 */
export async function withE2eEnv<T>(
  options: E2eEnvOptions | undefined,
  testFn: (env: E2eEnv) => Promise<T>
): Promise<T> {
  const env = await createE2eEnv(options);

  try {
    return await testFn(env);
  } finally {
    await env.restore();
  }
}

/**
 * Bun test utilities for E2E environment
 */
export function createE2eTestHooks(options?: E2eEnvOptions) {
  let env: E2eEnv;

  return {
    async beforeAll() {
      env = await createE2eEnv(options);
    },

    async afterAll() {
      if (env) {
        await env.restore();
      }
    },

    getEnv() {
      return env;
    },
  };
}
