import { canSpawnManually, canSpawnOnDemand } from "../core/spawn-policy";
import { buildOrchestratorSystemPrompt } from "../prompts/orchestrator-system";
import type { OrchestratorConfig } from "../types";
import type { WorkerManager } from "../workers";

export function createToolGuard(config: OrchestratorConfig) {
  type ToolArgs = Record<string, unknown>;
  const readString = (value: unknown): string =>
    typeof value === "string" ? value : value == null ? "" : String(value);

  // Get orchestrator agent name for permission checks
  const orchestratorName = config.agent?.name ?? "orchestrator";

  return async (input: { tool: string; agent?: string }, output: { args?: ToolArgs }) => {
    const args = output.args ?? {};
    const agentId = input.agent ?? orchestratorName;

    // spawn_worker is only available to the orchestrator agent
    if (input.tool === "spawn_worker") {
      if (agentId !== orchestratorName) {
        throw new Error(
          `Tool "spawn_worker" is only available to the orchestrator. ` +
            `Use "ask_worker" or "delegate_task" instead.`,
        );
      }
      const profileId = readString(args.profileId);
      if (profileId && !canSpawnManually(config.spawnPolicy, profileId))
        throw new Error(
          `Spawning worker "${profileId}" is disabled by spawnPolicy. ` +
            `Enable allowManual for this profile in orchestrator.json.`,
        );
    }

    // Prevent workers from spawning themselves via delegation
    if (input.tool === "delegate_task" || input.tool === "ask_worker" || input.tool === "ask_worker_async") {
      const workerId = readString(args.workerId);

      // Prevent self-spawning (worker trying to spawn itself)
      if (workerId && workerId === agentId) {
        throw new Error(`Worker "${agentId}" cannot delegate to itself. Choose a different worker.`);
      }

      const autoSpawn = args.autoSpawn !== false;
      if (autoSpawn && workerId && !canSpawnOnDemand(config.spawnPolicy, workerId))
        throw new Error(
          `On-demand spawn for worker "${workerId}" is disabled by spawnPolicy. ` +
            `Enable onDemand for this profile in orchestrator.json.`,
        );
    }

    // run_workflow is only available to the orchestrator agent
    if (input.tool === "run_workflow") {
      if (agentId !== orchestratorName) {
        throw new Error(`Tool "run_workflow" is only available to the orchestrator.`);
      }
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
