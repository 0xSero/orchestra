/**
 * Worker Registry - Backwards compatibility re-export from worker-pool
 *
 * @deprecated Use workerPool from "./worker-pool" directly
 */

import { workerPool, registry as _registry, WorkerPool } from "./worker-pool";

// Re-export the compatibility layer
export const registry = _registry;

// Also export WorkerRegistry class for type compatibility
export class WorkerRegistry {
  get workers() { return workerPool.workers; }
  register = workerPool.register.bind(workerPool);
  unregister = workerPool.unregister.bind(workerPool);
  getWorker = workerPool.get.bind(workerPool);
  trackOwnership = workerPool.trackOwnership.bind(workerPool);
  getWorkersForSession = workerPool.getWorkersForSession.bind(workerPool);
  clearSessionOwnership = workerPool.clearSessionOwnership.bind(workerPool);
  getWorkersByCapability = workerPool.getWorkersByCapability.bind(workerPool);
  getWorkersByStatus = workerPool.getWorkersByStatus.bind(workerPool);
  getActiveWorkers = workerPool.getActiveWorkers.bind(workerPool);
  getVisionWorkers = workerPool.getVisionWorkers.bind(workerPool);
  updateStatus = workerPool.updateStatus.bind(workerPool);
  getSummary = workerPool.getSummary.bind(workerPool);
  toJSON = workerPool.toJSON.bind(workerPool);
  on = workerPool.on.bind(workerPool);
  off = workerPool.off.bind(workerPool);
}

export { workerPool, WorkerPool };
