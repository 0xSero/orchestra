import { canSpawnManually, canSpawnOnDemand } from "../core/spawn-policy";
import { buildOrchestratorSystemPrompt } from "../prompts/orchestrator-system";
import type { OrchestratorConfig } from "../types";
import type { WorkerManager } from "../workers";

export function createToolGuard(config: OrchestratorConfig) {
  type ToolArgs = Record<string, unknown>;
  const readString = (value: unknown): string =>
    typeof value === "string" ? value : value == null ? "" : String(value);

  return async (input: { tool: string }, output: { args?: ToolArgs }) => {
    const args = output.args ?? {};

    if (input.tool === "spawn_worker") {
      const profileId = readString(args.profileId);
      if (profileId && !canSpawnManually(config.spawnPolicy, profileId))
        throw new Error(`Spawning worker "${profileId}" is disabled by spawnPolicy.`);
    }

    if (input.tool === "delegate_task" || input.tool === "ask_worker" || input.tool === "ask_worker_async") {
      const workerId = readString(args.workerId);
      const autoSpawn = args.autoSpawn !== false;
      if (autoSpawn && workerId && !canSpawnOnDemand(config.spawnPolicy, workerId))
        throw new Error(`On-demand spawn for worker "${workerId}" is disabled by spawnPolicy.`);
      // Note: Removed redundant spawnOnDemand whitelist check.
      // The spawnPolicy check above already controls on-demand spawning.
    }
  };
}

export function createSystemTransform(config: OrchestratorConfig, workers: WorkerManager) {
  return async (_input: Record<string, never>, output: { system: string[] }) => {
    if (config.ui?.injectSystemContext === false) return;

    // Build comprehensive orchestrator system prompt
    const runningWorkers = workers.listWorkers().map((w) => ({
      id: w.profile.id,
      name: w.profile.name,
      status: w.status,
    }));

    const orchestratorPrompt = buildOrchestratorSystemPrompt({
      config,
      profiles: workers.listProfiles(),
      runningWorkers,
      memoryEnabled: config.memory?.enabled !== false,
    });

    output.system.push(orchestratorPrompt);

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

export function createCompactionTransform(config: OrchestratorConfig, workers: WorkerManager) {
  return async (_input: { sessionID: string }, output: { context: string[]; prompt?: string }) => {
    if (config.ui?.injectSystemContext === false) return;
    output.context.push(workers.getSummary({ maxWorkers: config.ui?.systemContextMaxWorkers }));
  };
}
