import { canSpawnManually, canSpawnOnDemand } from "../core/spawn-policy";
import type { OrchestratorConfig } from "../types";
import type { WorkerManager } from "../workers";

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
        // Note: Removed redundant spawnOnDemand whitelist check.
        // The spawnPolicy check above already controls on-demand spawning.
      }
    }
  };
}

export function createSystemTransform(config: OrchestratorConfig, workers: WorkerManager) {
  return async (_input: Record<string, never>, output: { system: string[] }) => {
    if (config.ui?.injectSystemContext === false) return;
    output.system.push(workers.getSummary({ maxWorkers: config.ui?.systemContextMaxWorkers }));

    // Inject pending vision jobs so orchestrator knows to await them
    const pendingJobs = workers.jobs.list().filter((j) => j.status === "running" && j.workerId === "vision");
    if (pendingJobs.length > 0) {
      output.system.push(
        `
<pending-vision-analysis>
IMPORTANT: Vision analysis is in progress for ${pendingJobs.length} image(s).
You MUST call await_worker_job to get the results before responding about the image content:
${pendingJobs.map((j) => `- await_worker_job({ jobId: "${j.id}" })`).join("\n")}
</pending-vision-analysis>
      `.trim(),
      );
    }
  };
}
