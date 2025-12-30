/**
 * Test cleanup utilities
 * 
 * Provides robust cleanup management for test resources including
 * worker processes, temporary files, and directories.
 */

import { rm, unlink } from "node:fs/promises";
import { existsSync } from "node:fs";
import { listOpencodeServeProcesses } from "../../src/core/process-metrics";

/**
 * Cleanup manager for test resources
 */
export interface CleanupManager {
  /**
   * Register a worker process for cleanup
   * @param pid - Process ID to track
   */
  registerWorker(pid: number): void;

  /**
   * Register a file for cleanup
   * @param path - File path to track
   */
  registerFile(path: string): void;

  /**
   * Register a directory for cleanup
   * @param path - Directory path to track
   */
  registerDirectory(path: string): void;

  /**
   * Register a cleanup callback
   * @param callback - Function to call during cleanup
   */
  registerCallback(callback: () => Promise<void> | void): void;

  /**
   * Kill all registered worker processes
   * @returns Array of PIDs that were killed
   */
  killAllWorkers(): Promise<number[]>;

  /**
   * Remove all registered files
   * @returns Array of paths that were removed
   */
  removeAllFiles(): Promise<string[]>;

  /**
   * Remove all registered directories
   * @returns Array of paths that were removed
   */
  removeAllDirectories(): Promise<string[]>;

  /**
   * Run all cleanup operations
   * - Kill all registered workers
   * - Remove all registered files
   * - Remove all registered directories
   * - Run all registered callbacks
   */
  cleanupAll(): Promise<CleanupResult>;

  /**
   * Get current registered resources
   */
  getRegistered(): {
    workers: number[];
    files: string[];
    directories: string[];
    callbacks: number;
  };

  /**
   * Reset the manager (clear all registrations without cleanup)
   */
  reset(): void;
}

/**
 * Result of cleanup operations
 */
export interface CleanupResult {
  /** PIDs of killed workers */
  killedWorkers: number[];
  /** Paths of removed files */
  removedFiles: string[];
  /** Paths of removed directories */
  removedDirectories: string[];
  /** Number of callbacks executed */
  callbacksExecuted: number;
  /** Errors encountered during cleanup */
  errors: CleanupError[];
  /** Total cleanup duration in ms */
  durationMs: number;
}

/**
 * Error during cleanup operation
 */
export interface CleanupError {
  /** Type of resource */
  type: "worker" | "file" | "directory" | "callback";
  /** Resource identifier (pid, path, or callback index) */
  identifier: string;
  /** Error message */
  message: string;
  /** Original error */
  error: Error;
}

/**
 * Create a new CleanupManager instance
 * 
 * @example
 * ```typescript
 * const cleanup = createCleanupManager();
 * 
 * // Register resources during test
 * const worker = await spawnWorker(profile);
 * cleanup.registerWorker(worker.pid!);
 * 
 * const tempFile = '/tmp/test.txt';
 * await writeFile(tempFile, 'test');
 * cleanup.registerFile(tempFile);
 * 
 * // Cleanup after test
 * const result = await cleanup.cleanupAll();
 * console.log(`Cleaned up ${result.killedWorkers.length} workers`);
 * ```
 */
export function createCleanupManager(): CleanupManager {
  const workers = new Set<number>();
  const files = new Set<string>();
  const directories = new Set<string>();
  const callbacks: Array<() => Promise<void> | void> = [];

  return {
    registerWorker(pid: number): void {
      if (Number.isFinite(pid) && pid > 0) {
        workers.add(pid);
      }
    },

    registerFile(path: string): void {
      if (path && typeof path === "string") {
        files.add(path);
      }
    },

    registerDirectory(path: string): void {
      if (path && typeof path === "string") {
        directories.add(path);
      }
    },

    registerCallback(callback: () => Promise<void> | void): void {
      callbacks.push(callback);
    },

    async killAllWorkers(): Promise<number[]> {
      const killed: number[] = [];

      for (const pid of Array.from(workers)) {
        try {
          const isAlive = await isProcessAlive(pid);
          if (isAlive) {
            await killProcess(pid);
            killed.push(pid);
          }
        } catch {
          // Process may already be dead, ignore
        }
      }

      workers.clear();
      return killed;
    },

    async removeAllFiles(): Promise<string[]> {
      const removed: string[] = [];

      for (const path of Array.from(files)) {
        try {
          if (existsSync(path)) {
            await unlink(path);
            removed.push(path);
          }
        } catch {
          // File may already be deleted, ignore
        }
      }

      files.clear();
      return removed;
    },

    async removeAllDirectories(): Promise<string[]> {
      const removed: string[] = [];

      // Sort by path length descending to remove nested dirs first
      const sortedDirs = Array.from(directories).sort(
        (a, b) => b.length - a.length
      );

      for (const path of sortedDirs) {
        try {
          if (existsSync(path)) {
            await rm(path, { recursive: true, force: true });
            removed.push(path);
          }
        } catch {
          // Directory may already be deleted, ignore
        }
      }

      directories.clear();
      return removed;
    },

    async cleanupAll(): Promise<CleanupResult> {
      const startTime = performance.now();
      const errors: CleanupError[] = [];
      const killedWorkers: number[] = [];
      const removedFiles: string[] = [];
      const removedDirectories: string[] = [];
      let callbacksExecuted = 0;

      // Kill workers first
      for (const pid of Array.from(workers)) {
        try {
          const isAlive = await isProcessAlive(pid);
          if (isAlive) {
            await killProcess(pid);
            killedWorkers.push(pid);
          }
        } catch (error) {
          errors.push({
            type: "worker",
            identifier: String(pid),
            message: `Failed to kill worker: ${(error as Error).message}`,
            error: error as Error,
          });
        }
      }
      workers.clear();

      // Remove files
      for (const path of Array.from(files)) {
        try {
          if (existsSync(path)) {
            await unlink(path);
            removedFiles.push(path);
          }
        } catch (error) {
          errors.push({
            type: "file",
            identifier: path,
            message: `Failed to remove file: ${(error as Error).message}`,
            error: error as Error,
          });
        }
      }
      files.clear();

      // Remove directories (sorted by depth, deepest first)
      const sortedDirs = Array.from(directories).sort(
        (a, b) => b.length - a.length
      );

      for (const path of sortedDirs) {
        try {
          if (existsSync(path)) {
            await rm(path, { recursive: true, force: true });
            removedDirectories.push(path);
          }
        } catch (error) {
          errors.push({
            type: "directory",
            identifier: path,
            message: `Failed to remove directory: ${(error as Error).message}`,
            error: error as Error,
          });
        }
      }
      directories.clear();

      // Run callbacks
      for (let i = 0; i < callbacks.length; i++) {
        try {
          const result = callbacks[i]();
          if (result instanceof Promise) {
            await result;
          }
          callbacksExecuted++;
        } catch (error) {
          errors.push({
            type: "callback",
            identifier: String(i),
            message: `Cleanup callback failed: ${(error as Error).message}`,
            error: error as Error,
          });
        }
      }
      callbacks.length = 0;

      return {
        killedWorkers,
        removedFiles,
        removedDirectories,
        callbacksExecuted,
        errors,
        durationMs: performance.now() - startTime,
      };
    },

    getRegistered() {
      return {
        workers: Array.from(workers),
        files: Array.from(files),
        directories: Array.from(directories),
        callbacks: callbacks.length,
      };
    },

    reset(): void {
      workers.clear();
      files.clear();
      directories.clear();
      callbacks.length = 0;
    },
  };
}

/**
 * Check if a process is alive
 * 
 * @param pid - Process ID to check
 * @returns true if process is running
 */
export async function isProcessAlive(pid: number): Promise<boolean> {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * Kill a process by PID
 * 
 * @param pid - Process ID to kill
 * @param signal - Signal to send (default: SIGTERM)
 * @param timeout - Timeout in ms before SIGKILL (default: 5000)
 */
export async function killProcess(
  pid: number,
  signal: NodeJS.Signals = "SIGTERM",
  timeout = 5000
): Promise<void> {
  try {
    process.kill(pid, signal);
  } catch {
    // Process may already be dead
    return;
  }

  // Wait for process to die
  const startTime = Date.now();
  while (await isProcessAlive(pid)) {
    if (Date.now() - startTime > timeout) {
      // Force kill
      try {
        process.kill(pid, "SIGKILL");
      } catch {
        // Process died during our wait
      }
      break;
    }
    await sleep(100);
  }
}

/**
 * Kill all OpenCode serve processes
 * 
 * @returns Array of PIDs that were killed
 */
export async function killAllOpencodeProcesses(): Promise<number[]> {
  const procs = await listOpencodeServeProcesses();
  const killed: number[] = [];

  for (const proc of procs) {
    try {
      await killProcess(proc.pid);
      killed.push(proc.pid);
    } catch {
      // Process may already be dead
    }
  }

  return killed;
}

/**
 * Kill OpenCode processes matching a filter
 * 
 * @param filter - Function to filter processes by args
 * @returns Array of PIDs that were killed
 */
export async function killOpencodeProcessesMatching(
  filter: (args: string) => boolean
): Promise<number[]> {
  const procs = await listOpencodeServeProcesses();
  const killed: number[] = [];

  for (const proc of procs) {
    if (filter(proc.args)) {
      try {
        await killProcess(proc.pid);
        killed.push(proc.pid);
      } catch {
        // Process may already be dead
      }
    }
  }

  return killed;
}

/**
 * Wait for all OpenCode processes to terminate
 * 
 * @param timeout - Maximum wait time in ms (default: 30000)
 * @returns true if all processes terminated, false if timeout
 */
export async function waitForOpencodeProcessesToTerminate(
  timeout = 30000
): Promise<boolean> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    const procs = await listOpencodeServeProcesses();
    if (procs.length === 0) {
      return true;
    }
    await sleep(100);
  }

  return false;
}

/**
 * Global cleanup manager instance for convenience
 */
let globalCleanupManager: CleanupManager | null = null;

/**
 * Get or create the global cleanup manager
 */
export function getGlobalCleanupManager(): CleanupManager {
  if (!globalCleanupManager) {
    globalCleanupManager = createCleanupManager();
  }
  return globalCleanupManager;
}

/**
 * Reset the global cleanup manager
 */
export function resetGlobalCleanupManager(): void {
  if (globalCleanupManager) {
    globalCleanupManager.reset();
  }
  globalCleanupManager = null;
}

/**
 * Register process exit handler to run cleanup
 * 
 * @param cleanup - CleanupManager to use (default: global)
 */
export function registerExitHandler(cleanup?: CleanupManager): void {
  const manager = cleanup ?? getGlobalCleanupManager();

  const handler = async () => {
    await manager.cleanupAll();
  };

  process.on("exit", () => {
    // Can't await in exit handler, just try synchronously
    manager.killAllWorkers().catch(() => {});
  });

  process.on("SIGINT", () => {
    handler().finally(() => process.exit(1));
  });

  process.on("SIGTERM", () => {
    handler().finally(() => process.exit(1));
  });

  process.on("uncaughtException", (error) => {
    console.error("Uncaught exception:", error);
    handler().finally(() => process.exit(1));
  });
}

/**
 * Sleep utility
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Cleanup guard for use with try/finally patterns
 * 
 * @example
 * ```typescript
 * const guard = createCleanupGuard();
 * try {
 *   const worker = await spawnWorker(profile);
 *   guard.registerWorker(worker.pid!);
 *   
 *   // ... test code ...
 * } finally {
 *   await guard.cleanup();
 * }
 * ```
 */
export function createCleanupGuard() {
  const manager = createCleanupManager();

  return {
    ...manager,
    cleanup: () => manager.cleanupAll(),
  };
}
