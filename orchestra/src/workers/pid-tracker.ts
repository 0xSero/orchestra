import { execSync } from "node:child_process";
import { homedir } from "node:os";
import { join } from "node:path";
import { platform } from "node:process";

const PID_DIR = join(homedir(), ".opencode");
const PID_FILE = join(PID_DIR, "worker-pids.json");

type PidEntry = {
  pid: number;
  workerId: string;
  port?: number;
  createdAt: number;
  parentPid: number;
};

type PidStore = {
  entries: PidEntry[];
  updatedAt: number;
};

async function ensurePidDir(): Promise<void> {
  const dir = Bun.file(PID_DIR);
  if (!(await dir.exists())) {
    await Bun.write(join(PID_DIR, ".keep"), "");
  }
}

async function readPidStore(): Promise<PidStore> {
  try {
    const file = Bun.file(PID_FILE);
    if (await file.exists()) {
      const data = await file.json();
      if (data && Array.isArray(data.entries)) {
        return data as PidStore;
      }
    }
  } catch {
    // Corrupted file, start fresh
  }
  return { entries: [], updatedAt: Date.now() };
}

async function writePidStore(store: PidStore): Promise<void> {
  await ensurePidDir();
  store.updatedAt = Date.now();
  await Bun.write(PID_FILE, JSON.stringify(store, null, 2));
}

/**
 * Track a spawned worker's PID for cleanup.
 */
export async function trackWorkerPid(input: {
  pid: number;
  workerId: string;
  port?: number;
}): Promise<void> {
  const store = await readPidStore();

  // Remove any existing entry for this worker (in case of restart)
  store.entries = store.entries.filter((e) => e.workerId !== input.workerId);

  store.entries.push({
    pid: input.pid,
    workerId: input.workerId,
    port: input.port,
    createdAt: Date.now(),
    parentPid: process.pid,
  });

  await writePidStore(store);
}

/**
 * Remove a worker from PID tracking (called on graceful shutdown).
 */
export async function untrackWorkerPid(workerId: string): Promise<void> {
  const store = await readPidStore();
  store.entries = store.entries.filter((e) => e.workerId !== workerId);
  await writePidStore(store);
}

/**
 * Check if a process is still running.
 */
function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if a port is in use (indicates worker server is running).
 * More reliable than PID checking since we track orchestrator PID, not worker PID.
 */
function isPortInUse(port: number): boolean {
  if (!port || port === 0) return false;
  try {
    if (platform === "win32") {
      const result = execSync(`netstat -ano | findstr :${port}`, {
        encoding: "utf8",
        stdio: ["pipe", "pipe", "pipe"],
      });
      return result.includes(`:${port}`);
    } else {
      // Unix-like: use lsof which is more reliable
      const result = execSync(`lsof -i :${port} -t 2>/dev/null || true`, {
        encoding: "utf8",
        stdio: ["pipe", "pipe", "pipe"],
      });
      return result.trim().length > 0;
    }
  } catch {
    return false;
  }
}

/**
 * Kill a process gracefully, then forcefully if needed.
 */
async function killProcess(pid: number): Promise<boolean> {
  try {
    // Try SIGTERM first
    process.kill(pid, "SIGTERM");

    // Wait up to 2 seconds for graceful shutdown
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 100));
      if (!isProcessAlive(pid)) return true;
    }

    // Force kill if still alive
    process.kill(pid, "SIGKILL");
    return true;
  } catch {
    // Process already dead or permission denied
    return false;
  }
}

/**
 * Clean up stale worker process entries on startup.
 * IMPORTANT: This only removes stale ENTRIES from tracking, it does NOT kill processes.
 * We cannot safely kill processes by port because another application (like Chrome)
 * may have taken over the port since the worker was last running.
 */
export async function cleanupStaleWorkers(options?: {
  maxAgeMs?: number;
  dryRun?: boolean;
}): Promise<{ killed: string[]; removed: string[] }> {
  const maxAgeMs = options?.maxAgeMs ?? 24 * 60 * 60 * 1000; // 24 hours default
  const dryRun = options?.dryRun ?? false;

  const store = await readPidStore();
  const removed: string[] = [];
  const alive: PidEntry[] = [];

  for (const entry of store.entries) {
    const isStale = Date.now() - entry.createdAt > maxAgeMs;
    const parentDead = !isProcessAlive(entry.parentPid);
    const portActive = entry.port ? isPortInUse(entry.port) : false;

    if (!portActive && !isProcessAlive(entry.pid)) {
      // Neither port nor process active, safe to remove from tracking
      removed.push(entry.workerId);
      continue;
    }

    if (isStale || parentDead) {
      // Entry is stale/orphaned - remove from tracking but DO NOT kill the process
      // The port may now be used by a different application (e.g., browser)
      removed.push(entry.workerId);
      continue;
    }

    // Keep tracking this one
    alive.push(entry);
  }

  if (!dryRun) {
    store.entries = alive;
    await writePidStore(store);
  }

  // Return empty killed array - we no longer kill processes on cleanup
  return { killed: [], removed };
}

/**
 * Kill process(es) listening on a specific port.
 */
async function killProcessOnPort(port: number): Promise<boolean> {
  try {
    if (platform === "win32") {
      // Windows: find PID and kill it
      const result = execSync(`netstat -ano | findstr :${port}`, {
        encoding: "utf8",
        stdio: ["pipe", "pipe", "pipe"],
      });
      const pids = new Set<number>();
      for (const line of result.split("\n")) {
        const match = line.match(/\s+(\d+)\s*$/);
        if (match) pids.add(parseInt(match[1], 10));
      }
      for (const pid of pids) {
        await killProcess(pid);
      }
      return pids.size > 0;
    } else {
      // Unix: use lsof to find and kill
      const result = execSync(`lsof -i :${port} -t 2>/dev/null || true`, {
        encoding: "utf8",
        stdio: ["pipe", "pipe", "pipe"],
      });
      const pids = result
        .trim()
        .split("\n")
        .filter(Boolean)
        .map((p) => parseInt(p, 10));
      for (const pid of pids) {
        if (!isNaN(pid)) await killProcess(pid);
      }
      return pids.length > 0;
    }
  } catch {
    return false;
  }
}

/**
 * Kill all tracked workers (called on shutdown).
 */
export async function killAllTrackedWorkers(): Promise<string[]> {
  const store = await readPidStore();
  const killed: string[] = [];

  // Only kill workers spawned by this process
  const myWorkers = store.entries.filter((e) => e.parentPid === process.pid);

  for (const entry of myWorkers) {
    if (isProcessAlive(entry.pid)) {
      await killProcess(entry.pid);
      killed.push(entry.workerId);
    }
  }

  // Remove our workers from the store
  store.entries = store.entries.filter((e) => e.parentPid !== process.pid);
  await writePidStore(store);

  return killed;
}

/**
 * Get all currently tracked workers.
 */
export async function getTrackedWorkers(): Promise<PidEntry[]> {
  const store = await readPidStore();
  return store.entries;
}

/**
 * Clear all PID tracking (for testing or manual cleanup).
 */
export async function clearPidTracking(): Promise<void> {
  await writePidStore({ entries: [], updatedAt: Date.now() });
}
