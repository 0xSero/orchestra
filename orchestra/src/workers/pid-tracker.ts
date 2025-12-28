import { execSync } from "node:child_process";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";

type PidTrackerDeps = {
  platform?: string;
  execSync?: typeof execSync;
  homedir?: typeof homedir;
  tmpdir?: typeof tmpdir;
};

const resolveHomeDir = (deps?: PidTrackerDeps): string => {
  const platform = deps?.platform ?? process.platform;
  const homedirFn = deps?.homedir ?? homedir;
  const tmpdirFn = deps?.tmpdir ?? tmpdir;
  const fallbackDir = tmpdirFn();
  if (platform === "win32") {
    return process.env.USERPROFILE || homedirFn() || fallbackDir;
  }
  const candidate = process.env.HOME || homedirFn();
  if (!candidate || candidate === "/") return fallbackDir;
  return candidate;
};

const getPidDir = (deps?: PidTrackerDeps): string => join(resolveHomeDir(deps), ".opencode");
const getPidFile = (deps?: PidTrackerDeps): string => join(getPidDir(deps), "worker-pids.json");

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

async function ensurePidDir(deps?: PidTrackerDeps): Promise<void> {
  const dirPath = getPidDir(deps);
  const dir = Bun.file(dirPath);
  if (!(await dir.exists())) {
    await Bun.write(join(dirPath, ".keep"), "");
  }
}

async function readPidStore(deps?: PidTrackerDeps): Promise<PidStore> {
  try {
    const file = Bun.file(getPidFile(deps));
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

async function writePidStore(store: PidStore, deps?: PidTrackerDeps): Promise<void> {
  await ensurePidDir(deps);
  store.updatedAt = Date.now();
  await Bun.write(getPidFile(deps), JSON.stringify(store, null, 2));
}

/**
 * Track a spawned worker's PID for cleanup.
 */
export async function trackWorkerPid(input: {
  pid: number;
  workerId: string;
  port?: number;
  deps?: PidTrackerDeps;
}): Promise<void> {
  const store = await readPidStore(input.deps);

  // Remove any existing entry for this worker (in case of restart)
  store.entries = store.entries.filter((e) => e.workerId !== input.workerId);

  store.entries.push({
    pid: input.pid,
    workerId: input.workerId,
    port: input.port,
    createdAt: Date.now(),
    parentPid: process.pid,
  });

  await writePidStore(store, input.deps);
}

/**
 * Remove a worker from PID tracking (called on graceful shutdown).
 */
export async function untrackWorkerPid(workerId: string, deps?: PidTrackerDeps): Promise<void> {
  const store = await readPidStore(deps);
  store.entries = store.entries.filter((e) => e.workerId !== workerId);
  await writePidStore(store, deps);
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
function isPortInUse(port: number, deps?: PidTrackerDeps): boolean {
  if (!port || port === 0) return false;
  try {
    const platform = deps?.platform ?? process.platform;
    const exec = deps?.execSync ?? execSync;
    if (platform === "win32") {
      const result = exec(`netstat -ano | findstr :${port}`, {
        encoding: "utf8",
        stdio: ["pipe", "pipe", "pipe"],
      });
      return result.includes(`:${port}`);
    } else {
      // Unix-like: use lsof which is more reliable
      const result = exec(`lsof -i :${port} -t 2>/dev/null || true`, {
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
  deps?: PidTrackerDeps;
}): Promise<{ killed: string[]; removed: string[] }> {
  const maxAgeMs = options?.maxAgeMs ?? 24 * 60 * 60 * 1000; // 24 hours default
  const dryRun = options?.dryRun ?? false;
  const deps = options?.deps;

  const store = await readPidStore(deps);
  const removed: string[] = [];
  const alive: PidEntry[] = [];

  for (const entry of store.entries) {
    const isStale = Date.now() - entry.createdAt > maxAgeMs;
    const parentDead = !isProcessAlive(entry.parentPid);
    const portActive = entry.port ? isPortInUse(entry.port, deps) : false;

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
    await writePidStore(store, deps);
  }

  // Return empty killed array - we no longer kill processes on cleanup
  return { killed: [], removed };
}

/**
 * Kill process(es) listening on a specific port.
 */
/** @internal */
export async function killProcessOnPort(
  port: number,
  deps?: PidTrackerDeps,
  options?: { skipPid?: number },
): Promise<boolean> {
  const skipPid = options?.skipPid;
  try {
    const platform = deps?.platform ?? process.platform;
    const exec = deps?.execSync ?? execSync;
    if (platform === "win32") {
      // Windows: find PID and kill it
      const result = exec(`netstat -ano | findstr :${port}`, {
        encoding: "utf8",
        stdio: ["pipe", "pipe", "pipe"],
      });
      const pids = new Set<number>();
      for (const line of result.split("\n")) {
        const match = line.match(/\s+(\d+)\s*$/);
        if (match) pids.add(parseInt(match[1], 10));
      }
      let killedAny = false;
      for (const pid of pids) {
        if (skipPid && pid === skipPid) continue;
        await killProcess(pid);
        killedAny = true;
      }
      return killedAny;
    } else {
      // Unix: use lsof to find and kill
      const result = exec(`lsof -i :${port} -t 2>/dev/null || true`, {
        encoding: "utf8",
        stdio: ["pipe", "pipe", "pipe"],
      });
      const pids = result
        .trim()
        .split("\n")
        .filter(Boolean)
        .map((p) => parseInt(p, 10));
      let killedAny = false;
      for (const pid of pids) {
        if (Number.isNaN(pid)) continue;
        if (skipPid && pid === skipPid) continue;
        await killProcess(pid);
        killedAny = true;
      }
      return killedAny;
    }
  } catch {
    return false;
  }
}

/**
 * Kill all tracked workers (called on shutdown).
 */
export async function killAllTrackedWorkers(deps?: PidTrackerDeps): Promise<string[]> {
  const store = await readPidStore(deps);
  const killed: string[] = [];

  // Only kill workers spawned by this process
  const myWorkers = store.entries.filter((e) => e.parentPid === process.pid);

  for (const entry of myWorkers) {
    if (entry.pid === process.pid) {
      if (entry.port) {
        const killedPort = await killProcessOnPort(entry.port, deps, { skipPid: process.pid });
        if (killedPort) killed.push(entry.workerId);
      }
      continue;
    }
    if (isProcessAlive(entry.pid)) {
      await killProcess(entry.pid);
      killed.push(entry.workerId);
    }
  }

  // Remove our workers from the store
  store.entries = store.entries.filter((e) => e.parentPid !== process.pid);
  await writePidStore(store, deps);

  return killed;
}

/**
 * Get all currently tracked workers.
 */
export async function getTrackedWorkers(deps?: PidTrackerDeps): Promise<PidEntry[]> {
  const store = await readPidStore(deps);
  return store.entries;
}

/**
 * Clear all PID tracking (for testing or manual cleanup).
 */
export async function clearPidTracking(deps?: PidTrackerDeps): Promise<void> {
  await writePidStore({ entries: [], updatedAt: Date.now() }, deps);
}
