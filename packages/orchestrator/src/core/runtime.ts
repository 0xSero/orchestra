import { randomUUID } from "node:crypto";
import { workerPool, listDeviceRegistry, removeWorkerEntriesByPid, upsertWorkerEntry, pruneDeadEntries } from "./worker-pool";
import { startBridgeServer, type BridgeServer } from "./bridge-server";
import { isProcessAlive } from "../helpers/process";

export type OrchestratorRuntime = {
  instanceId: string;
  bridge: BridgeServer;
};

let runtime: OrchestratorRuntime | undefined;
let cleanupInstalled = false;
let shutdownPromise: Promise<void> | undefined;
let shutdownRequested = false;

const SHUTDOWN_TIMEOUT_MS = 6000;

async function runShutdown(_reason: string): Promise<void> {
  if (shutdownPromise) return shutdownPromise;
  shutdownRequested = true;
  shutdownPromise = (async () => {
    const workers = [...workerPool.workers.values()];
    const finished = await Promise.race([
      shutdownAllWorkers().then(() => true),
      new Promise<boolean>((resolve) => setTimeout(() => resolve(false), SHUTDOWN_TIMEOUT_MS)),
    ]);

    if (!finished) {
      for (const worker of workers) {
        if (worker.shutdown && typeof worker.pid === "number") {
          try {
            // Try process-group kill first (covers grand-children if worker was spawned detached).
            if (process.platform !== "win32") process.kill(-worker.pid, "SIGKILL");
            else process.kill(worker.pid, "SIGKILL");
          } catch {
            // ignore
          }
        }
      }
    }

    try {
      await runtime?.bridge.close();
    } catch {
      // ignore
    }
  })();
  return shutdownPromise;
}

export function getOrchestratorInstanceId(): string {
  return runtime?.instanceId ?? "uninitialized";
}

export async function ensureRuntime(): Promise<OrchestratorRuntime> {
  if (runtime) {
    return runtime;
  }

  const instanceId = randomUUID();
  const bridge = await startBridgeServer();
  runtime = { instanceId, bridge };
  workerPool.setInstanceId(instanceId);
  
  // Cleanup orphaned workers and sessions from previous crashes/terminations
  void cleanupOrphanedWorkers().catch(() => {});
  void cleanupOrphanedSessions().catch(() => {});

  if (!cleanupInstalled) {
    cleanupInstalled = true;
    const handleSignal = (signal: string, code: number) => {
      if (shutdownRequested) {
        process.exit(code);
        return;
      }
      void (async () => {
        await runShutdown(signal);
        process.exit(code);
      })();
    };
    process.once("beforeExit", () => {
      void runShutdown("beforeExit");
    });
    process.once("exit", () => {
      if (shutdownRequested) return;
      const workers = [...workerPool.workers.values()];
      for (const worker of workers) {
        if (typeof worker.pid === "number") {
          try {
            if (process.platform !== "win32") process.kill(-worker.pid, "SIGTERM");
            else process.kill(worker.pid, "SIGTERM");
          } catch {
            // ignore
          }
          try {
            if (process.platform !== "win32") process.kill(-worker.pid, "SIGKILL");
            else process.kill(worker.pid, "SIGKILL");
          } catch {
            // ignore
          }
        }
      }
    });
    // Prepend so we run even if OpenCode registers its own handlers.
    process.prependListener("SIGINT", () => handleSignal("SIGINT", 130));
    process.prependListener("SIGTERM", () => handleSignal("SIGTERM", 143));
    process.prependListener("SIGHUP", () => handleSignal("SIGHUP", 129));
  }

  return runtime;
}

async function cleanupOrphanedWorkers(): Promise<void> {
  const entries = await listDeviceRegistry();
  const workers = entries.filter((e) => e.kind === "worker");
  
  // Track which worker PIDs are legitimately owned by live orchestrators
  const liveWorkerPids = new Set<number>();
  
  const byPid = new Map<number, typeof workers>();
  for (const entry of workers) {
    const list = byPid.get(entry.pid) ?? [];
    list.push(entry);
    byPid.set(entry.pid, list);
  }

  const now = Date.now();
  const instanceId = runtime?.instanceId;
  const orphanStaleMs = 10 * 60 * 1000;

  for (const [pid, group] of byPid.entries()) {
    const anyWithHost = group.some((e) => typeof e.hostPid === "number");
    if (anyWithHost) {
      const hostAlive = group.some((e) => typeof e.hostPid === "number" && isProcessAlive(e.hostPid));
      if (hostAlive) {
        liveWorkerPids.add(pid);
        continue;
      }
    } else {
      // Legacy entries without hostPid: only clean up if they're stale and clearly not ours.
      const newestUpdate = Math.max(...group.map((e) => e.updatedAt ?? 0));
      if (now - newestUpdate < orphanStaleMs) {
        liveWorkerPids.add(pid);
        continue;
      }
      if (instanceId && group.some((e) => e.orchestratorInstanceId === instanceId)) {
        liveWorkerPids.add(pid);
        continue;
      }
    }

    for (const entry of group) {
      await removeWorkerEntriesByPid(entry.pid).catch(() => {});
    }
    killWorkerProcess(pid);
  }
  
  // Also clean up any orphaned "opencode serve" processes not in registry
  await cleanupOrphanedServeProcesses(liveWorkerPids);
}

function killWorkerProcess(pid: number): void {
  try {
    if (process.platform !== "win32") process.kill(-pid, "SIGTERM");
    else process.kill(pid, "SIGTERM");
  } catch {
    // ignore
  }
  try {
    if (process.platform !== "win32") process.kill(-pid, "SIGKILL");
    else process.kill(pid, "SIGKILL");
  } catch {
    // ignore
  }
}

async function cleanupOrphanedServeProcesses(liveWorkerPids: Set<number>): Promise<void> {
  // Find all "opencode serve" processes and kill any that aren't in our live list
  // This catches processes that were orphaned but never registered (or registry was corrupted)
  if (process.platform === "win32") return; // TODO: Windows support
  
  try {
    const { execSync } = await import("node:child_process");
    const psOutput = execSync("ps aux", { encoding: "utf8", timeout: 5000 });
    const lines = psOutput.split("\n");
    
    const currentPid = process.pid;
    const serveProcesses: number[] = [];
    
    for (const line of lines) {
      // Match "opencode serve" processes (but not tsserver or other Node processes)
      if (!line.includes("opencode serve --hostname")) continue;
      // Skip the grep/ps process itself
      if (line.includes("grep") || line.includes(" ps ")) continue;
      
      const parts = line.trim().split(/\s+/);
      const pid = Number.parseInt(parts[1], 10);
      if (!Number.isFinite(pid) || pid <= 1) continue;
      
      // Never kill our own process
      if (pid === currentPid) continue;
      
      serveProcesses.push(pid);
    }
    
    for (const pid of serveProcesses) {
      // Skip if this is a known live worker
      if (liveWorkerPids.has(pid)) continue;
      
      // Check if the parent process (ppid) is still alive
      // If parent is dead, this is definitely orphaned
      try {
        const ppidOutput = execSync(`ps -o ppid= -p ${pid}`, { encoding: "utf8", timeout: 2000 }).trim();
        const ppid = Number.parseInt(ppidOutput, 10);
        if (Number.isFinite(ppid) && ppid > 1 && isProcessAlive(ppid)) {
          // Parent is alive, might be legitimately running - skip
          continue;
        }
      } catch {
        // If we can't get ppid, assume orphaned
      }
      
      // This is an orphaned serve process - kill it
      killWorkerProcess(pid);
    }
  } catch {
    // If ps fails, skip cleanup
  }
}

async function cleanupOrphanedSessions(): Promise<void> {
  // Remove session entries whose hostPid is no longer alive
  const entries = await listDeviceRegistry();
  const sessions = entries.filter((e) => e.kind === "session");
  
  for (const session of sessions) {
    if (!isProcessAlive(session.hostPid)) {
      await removeSessionEntryByHostPid(session.hostPid).catch(() => {});
    }
  }
}

async function removeSessionEntryByHostPid(_hostPid: number): Promise<void> {
  await pruneDeadEntries();
}

export async function shutdownAllWorkers(): Promise<void> {
  const workers = [...workerPool.workers.values()];
  await Promise.allSettled(
    workers.map(async (w) => {
      try {
        if (w.shutdown) await w.shutdown();
      } finally {
        if (typeof w.pid === "number") await removeWorkerEntriesByPid(w.pid).catch(() => {});
      }
    })
  );
  for (const w of workers) {
    workerPool.unregister(w.profile.id);
  }
}

export async function registerWorkerInDeviceRegistry(input: {
  workerId: string;
  pid: number;
  url?: string;
  port?: number;
  sessionId?: string;
  status: "starting" | "ready" | "busy" | "error" | "stopped";
  startedAt: number;
  lastError?: string;
}): Promise<void> {
  const rt = await ensureRuntime();
  await upsertWorkerEntry({
    orchestratorInstanceId: rt.instanceId,
    hostPid: process.pid,
    workerId: input.workerId,
    pid: input.pid,
    url: input.url,
    port: input.port,
    sessionId: input.sessionId,
    status: input.status,
    startedAt: input.startedAt,
    lastError: input.lastError,
  }).catch(() => {});
}
