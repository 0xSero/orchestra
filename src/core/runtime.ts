import { randomUUID } from "node:crypto";
import { registry } from "./registry";
import { startBridgeServer, type BridgeServer } from "./bridge-server";
import { removeWorkerEntriesByPid, upsertWorkerEntry } from "./device-registry";

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
    const workers = [...registry.workers.values()];
    const finished = await Promise.race([
      shutdownAllWorkers().then(() => true),
      new Promise<boolean>((resolve) => setTimeout(() => resolve(false), SHUTDOWN_TIMEOUT_MS)),
    ]);

    if (!finished) {
      for (const worker of workers) {
        if (worker.shutdown && typeof worker.pid === "number") {
          try {
            process.kill(worker.pid, "SIGKILL");
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
    process.once("SIGINT", () => handleSignal("SIGINT", 130));
    process.once("SIGTERM", () => handleSignal("SIGTERM", 143));
  }

  return runtime;
}

export async function shutdownAllWorkers(): Promise<void> {
  const workers = [...registry.workers.values()];
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
    registry.unregister(w.profile.id);
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
