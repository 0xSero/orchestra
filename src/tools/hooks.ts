import type { OrchestratorConfig } from "../types";
import type { WorkerManager } from "../workers";
import { canSpawnManually, canSpawnOnDemand } from "../core/spawn-policy";

export function createToolGuard(config: OrchestratorConfig) {
  return async (input: { tool: string }, output: { args: any }) => {
    const args = output.args ?? {};

    if (input.tool === "spawn_worker") {
      const profileId = String(args?.profileId ?? "");
      if (profileId && !canSpawnManually(config.spawnPolicy, profileId)) {
        throw new Error(`Spawning worker "${profileId}" is disabled by spawnPolicy.`);
      }
    }

    if (input.tool === "delegate_task" || input.tool === "ask_worker" || input.tool === "ask_worker_async") {
      const workerId = String(args?.workerId ?? "");
      const autoSpawn = args?.autoSpawn !== false;
      if (autoSpawn && workerId) {
        if (!canSpawnOnDemand(config.spawnPolicy, workerId)) {
          throw new Error(`On-demand spawn for worker "${workerId}" is disabled by spawnPolicy.`);
        }
        if (Array.isArray(config.spawnOnDemand) && !config.spawnOnDemand.includes(workerId)) {
          throw new Error(`Worker "${workerId}" is not enabled for on-demand spawn.`);
        }
      }
    }
  };
}

export function createSystemTransform(config: OrchestratorConfig, workers: WorkerManager) {
  return async (_input: {}, output: { system: string[] }) => {
    if (config.ui?.injectSystemContext === false) return;
    output.system.push(workers.getSummary({ maxWorkers: config.ui?.systemContextMaxWorkers }));
  };
}
