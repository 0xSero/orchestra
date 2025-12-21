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
    const shutdown = () => {
      void shutdownAllWorkers().catch(() => {});
    };
    process.once("exit", shutdown);
    process.once("SIGINT", () => {
      shutdown();
      process.exit(130);
    });
    process.once("SIGTERM", () => {
      shutdown();
      process.exit(143);
    });
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
