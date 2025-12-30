import type { OrchestratorContext } from "../context/orchestrator-context";
import { logger } from "../core/logger";
import { publishErrorEvent } from "../core/orchestrator-events";
import { sendToWorker, spawnWorker } from "../workers/spawner";
import { runWorkflow } from "./engine";
import type { WorkflowRunInput, WorkflowRunResult, WorkflowSecurityLimits } from "./types";

const defaultLimits: WorkflowSecurityLimits = {
  maxSteps: 4,
  maxTaskChars: 12000,
  maxCarryChars: 24000,
  perStepTimeoutMs: 120_000,
};

function clampLimit(value: number | undefined, cap: number | undefined, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return cap ?? fallback;
  if (typeof cap === "number" && Number.isFinite(cap)) return Math.min(value, cap);
  return value;
}

export function resolveWorkflowLimits(context: OrchestratorContext, workflowId: string): WorkflowSecurityLimits {
  const security = context.security?.workflows;
  const workflows = context.workflows;
  const roocode = workflowId === "roocode-boomerang" ? workflows?.roocodeBoomerang : undefined;

  const maxStepsCap = security?.maxSteps ?? defaultLimits.maxSteps;
  const maxTaskCap = security?.maxTaskChars ?? defaultLimits.maxTaskChars;
  const maxCarryCap = security?.maxCarryChars ?? defaultLimits.maxCarryChars;
  const perStepCap = security?.perStepTimeoutMs ?? defaultLimits.perStepTimeoutMs;

  return {
    maxSteps: clampLimit(roocode?.maxSteps, maxStepsCap, defaultLimits.maxSteps),
    maxTaskChars: clampLimit(roocode?.maxTaskChars, maxTaskCap, defaultLimits.maxTaskChars),
    maxCarryChars: clampLimit(roocode?.maxCarryChars, maxCarryCap, defaultLimits.maxCarryChars),
    perStepTimeoutMs: clampLimit(roocode?.perStepTimeoutMs, perStepCap, defaultLimits.perStepTimeoutMs),
  };
}

export async function runWorkflowWithContext(
  context: OrchestratorContext,
  input: Omit<WorkflowRunInput, "limits"> & { limits?: WorkflowSecurityLimits },
  options?: { sessionId?: string }
): Promise<WorkflowRunResult> {
  const workerPool = context.workerPool;
  const limits = input.limits ?? resolveWorkflowLimits(context, input.workflowId);

  const ensureWorker = async (workerId: string, autoSpawn: boolean): Promise<string> => {
    const existing = workerPool.get(workerId);
    if (existing && existing.status !== "error" && existing.status !== "stopped") {
      return existing.profile.id;
    }
    if (!autoSpawn) {
      throw new Error(`Worker "${workerId}" is not running. Spawn it first or pass autoSpawn=true.`);
    }

    const profile = context.profiles[workerId];
    if (!profile) {
      throw new Error(`Unknown worker profile "${workerId}".`);
    }

    const { basePort, timeout } = context.spawnDefaults;
    const instance = await spawnWorker(profile, {
      basePort,
      timeout,
      directory: context.directory,
      client: context.client,
    });
    return instance.profile.id;
  };

  const startedAt = Date.now();
  logger.info(`[workflow] ${input.workflowId} started`);

  let result: WorkflowRunResult;
  try {
    result = await runWorkflow(
      {
        workflowId: input.workflowId,
        task: input.task,
        attachments: input.attachments,
        autoSpawn: input.autoSpawn ?? true,
        limits,
      },
      {
        resolveWorker: async (workerId, autoSpawn) => {
          const existing = workerPool.get(workerId);
          const resolved = await ensureWorker(workerId, autoSpawn);
          const instance = workerPool.get(resolved);
          if (options?.sessionId && !existing && instance && instance.modelResolution !== "reused existing worker") {
            workerPool.trackOwnership(options.sessionId, instance.profile.id);
          }
          return resolved;
        },
        sendToWorker: async (workerId, message, optionsInput) =>
          sendToWorker(workerId, message, {
            attachments: optionsInput.attachments,
            timeout: optionsInput.timeoutMs,
            sessionId: options?.sessionId,
          }),
      }
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    publishErrorEvent({
      message: msg,
      source: "workflow",
      workflowId: input.workflowId,
    });
    throw err;
  }

  const durationMs = Date.now() - startedAt;
  const failed = result.steps.some((step) => step.status === "error");
  if (failed) {
    logger.warn(`[workflow] ${input.workflowId} completed with errors (${durationMs}ms)`);
  } else {
    logger.info(`[workflow] ${input.workflowId} completed (${durationMs}ms)`);
  }

  return result;
}
