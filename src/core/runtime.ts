import { workerPool } from "./worker-pool";
import { startBridgeServer, type BridgeServer } from "./bridge-server";
import { gracefulShutdown } from "./shutdown";

export type OrchestratorRuntime = {
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
    await gracefulShutdown(_reason).catch(() => {});
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

export async function ensureRuntime(): Promise<OrchestratorRuntime> {
  if (runtime) {
    return runtime;
  }

  const bridge = await startBridgeServer();
  runtime = { bridge };

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
export async function shutdownAllWorkers(): Promise<void> {
  const workers = [...workerPool.workers.values()];
  await Promise.allSettled(
    workers.map(async (w) => {
      try {
        if (w.shutdown) await w.shutdown();
      } finally {
        // No persistence to update.
      }
    })
  );
  for (const w of workers) {
    workerPool.unregister(w.profile.id);
  }
}
