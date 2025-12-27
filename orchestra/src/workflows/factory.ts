import type { Factory, ServiceLifecycle, WorkflowsConfig } from "../types";
import { buildBuiltinWorkflows } from "./builtins";
import type { WorkflowDefinition, WorkflowRunInput, WorkflowRunResult, WorkflowStepDefinition } from "./types";

export type WorkflowEngineConfig = WorkflowsConfig | undefined;

export type WorkflowRunDependencies = {
  resolveWorker: (workerId: string, autoSpawn: boolean) => Promise<string>;
  sendToWorker: (
    workerId: string,
    message: string,
    options: { attachments?: WorkflowRunInput["attachments"]; timeoutMs: number },
  ) => Promise<{ success: boolean; response?: string; error?: string }>;
};

export type WorkflowEngine = ServiceLifecycle & {
  register: (def: WorkflowDefinition) => void;
  list: () => WorkflowDefinition[];
  get: (id: string) => WorkflowDefinition | undefined;
  run: (input: WorkflowRunInput, deps: WorkflowRunDependencies) => Promise<WorkflowRunResult>;
};

function applyTemplate(template: string, vars: Record<string, string>): string {
  let out = template;
  for (const [key, value] of Object.entries(vars)) {
    out = out.replaceAll(`{${key}}`, value);
  }
  return out;
}

function appendCarry(existing: string, next: string, maxChars: number): string {
  const combined = existing ? `${existing}\n\n${next}` : next;
  if (combined.length <= maxChars) return combined;
  return combined.slice(combined.length - maxChars);
}

function buildStepPrompt(step: WorkflowStepDefinition, task: string, carry: string): string {
  const base = applyTemplate(step.prompt, { task, carry });
  if (!step.carry || !carry) return base;
  return base;
}

export const createWorkflowEngine: Factory<WorkflowEngineConfig, Record<string, never>, WorkflowEngine> = ({
  config,
}) => {
  const workflows = new Map<string, WorkflowDefinition>();

  const register = (def: WorkflowDefinition) => {
    workflows.set(def.id, def);
  };

  const list = () => [...workflows.values()].sort((a, b) => a.id.localeCompare(b.id));

  const get = (id: string) => workflows.get(id);

  const run = async (input: WorkflowRunInput, deps: WorkflowRunDependencies): Promise<WorkflowRunResult> => {
    const workflow = get(input.workflowId);
    if (!workflow) throw new Error(`Unknown workflow "${input.workflowId}".`);

    if (input.task.length > input.limits.maxTaskChars) {
      throw new Error(`Task exceeds maxTaskChars (${input.limits.maxTaskChars}).`);
    }

    if (workflow.steps.length > input.limits.maxSteps) {
      throw new Error(`Workflow has ${workflow.steps.length} steps (maxSteps=${input.limits.maxSteps}).`);
    }

    const startedAt = Date.now();
    const steps: WorkflowRunResult["steps"] = [];
    let carry = "";

    for (let i = 0; i < workflow.steps.length; i += 1) {
      const step = workflow.steps[i];
      const stepStarted = Date.now();
      const workerId = await deps.resolveWorker(step.workerId, input.autoSpawn ?? true);
      const prompt = buildStepPrompt(step, input.task, carry);
      const res = await deps.sendToWorker(workerId, prompt, {
        attachments: i === 0 ? input.attachments : undefined,
        timeoutMs: input.limits.perStepTimeoutMs,
      });
      const stepFinished = Date.now();

      if (!res.success) {
        steps.push({
          id: step.id,
          title: step.title,
          workerId,
          status: "error",
          error: res.error ?? "unknown_error",
          startedAt: stepStarted,
          finishedAt: stepFinished,
          durationMs: stepFinished - stepStarted,
        });
        break;
      }

      const response = res.response ?? "";
      steps.push({
        id: step.id,
        title: step.title,
        workerId,
        status: "success",
        response,
        startedAt: stepStarted,
        finishedAt: stepFinished,
        durationMs: stepFinished - stepStarted,
      });

      if (step.carry) {
        const carryBlock = [`### ${step.title}`, response].join("\n");
        carry = appendCarry(carry, carryBlock, input.limits.maxCarryChars);
      }
    }

    return {
      workflowId: workflow.id,
      workflowName: workflow.name,
      startedAt,
      finishedAt: Date.now(),
      steps,
    };
  };

  const start = async () => {
    const enabled = config?.enabled !== false;
    if (!enabled) return;
    for (const wf of buildBuiltinWorkflows()) register(wf);
  };

  return {
    register,
    list,
    get,
    run,
    start,
    stop: async () => {
      workflows.clear();
    },
    health: async () => ({ ok: true }),
  };
};
