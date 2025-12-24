import { workerPool } from "./worker-pool";
import type { WorkerInstance } from "../types";

export type ShutdownState = "running" | "shutting_down";

let shutdownState: ShutdownState = "running";

export function getShutdownState(): ShutdownState {
  return shutdownState;
}

function formatShutdownMessage(worker: WorkerInstance): string {
  return (
    `<orchestrator_shutdown workerId="${worker.profile.id}">
` +
    `Orchestrator is shutting down. Please acknowledge and flush any in-flight work.
` +
    `Respond with "ACK" if possible.
` +
    `</orchestrator_shutdown>`
  );
}

async function sendShutdownNotice(worker: WorkerInstance): Promise<boolean> {
  if (!worker.client || !worker.sessionId) return false;
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(new Error("shutdown timeout")), 5_000);

  try {
    const result = await worker.client.session.prompt({
      path: { id: worker.sessionId },
      body: { parts: [{ type: "text", text: formatShutdownMessage(worker) }] as any },
      query: { directory: worker.directory },
      signal: abort.signal as any,
    } as any);
    const sdkError: any = (result as any)?.error;
    if (sdkError) return false;
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

export async function gracefulShutdown(_reason: string): Promise<void> {
  shutdownState = "shutting_down";

  const workers = [...workerPool.workers.values()];

  await Promise.allSettled(
    workers.map(async (worker) => {
      if (typeof worker.pid !== "number") return;
      await sendShutdownNotice(worker);
    })
  );
}
