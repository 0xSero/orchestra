import { randomUUID } from "node:crypto";
import type {
  WorkflowDefinition,
  WorkflowRunInput,
  WorkflowRunResult,
  WorkflowStepDefinition,
  WorkflowStepResult,
} from "./types";
import { publishOrchestratorEvent } from "../core/orchestrator-events";

const workflows = new Map<string, WorkflowDefinition>();

export type WorkflowRunDependencies = {
  resolveWorker: (workerId: string, autoSpawn: boolean) => Promise<string>;
  sendToWorker: (
    workerId: string,
    message: string,
    options: { attachments?: WorkflowRunInput["attachments"]; timeoutMs: number }
  ) => Promise<{ success: boolean; response?: string; warning?: string; error?: string }>;
};

export function registerWorkflow(def: WorkflowDefinition) {
  workflows.set(def.id, def);
}

export function listWorkflows(): WorkflowDefinition[] {
  return [...workflows.values()].sort((a, b) => a.id.localeCompare(b.id));
}

export function getWorkflow(id: string): WorkflowDefinition | undefined {
  return workflows.get(id);
}

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

function truncateResponse(text: string, maxChars = 1200): { value: string; truncated: boolean } {
  if (text.length <= maxChars) return { value: text, truncated: false };
  return { value: text.slice(0, maxChars), truncated: true };
}

function buildStepPrompt(step: WorkflowStepDefinition, task: string, carry: string): string {
  const base = applyTemplate(step.prompt, { task, carry });
  if (!step.carry || !carry) return base;
  return base;
}

function resolveStepTimeout(step: WorkflowStepDefinition, limits: WorkflowRunInput["limits"]): number {
  const requested =
    typeof step.timeoutMs === "number" && Number.isFinite(step.timeoutMs) && step.timeoutMs > 0
      ? step.timeoutMs
      : limits.perStepTimeoutMs;
  if (typeof limits.perStepTimeoutMs !== "number" || !Number.isFinite(limits.perStepTimeoutMs)) {
    return requested;
  }
  return Math.min(requested, limits.perStepTimeoutMs);
}

export function validateWorkflowInput(input: WorkflowRunInput, workflow: WorkflowDefinition): void {
  if (input.task.length > input.limits.maxTaskChars) {
    throw new Error(`Task exceeds maxTaskChars (${input.limits.maxTaskChars}).`);
  }

  if (workflow.steps.length > input.limits.maxSteps) {
    throw new Error(`Workflow has ${workflow.steps.length} steps (maxSteps=${input.limits.maxSteps}).`);
  }
}

export async function executeWorkflowStep(
  input: {
    runId: string;
    workflow: WorkflowDefinition;
    stepIndex: number;
    task: string;
    carry: string;
    autoSpawn: boolean;
    limits: WorkflowRunInput["limits"];
    attachments?: WorkflowRunInput["attachments"];
  },
  deps: WorkflowRunDependencies
): Promise<{ step: WorkflowStepResult; response?: string; carry: string }> {
  const step = input.workflow.steps[input.stepIndex];
  const stepStarted = Date.now();
  const workerId = await deps.resolveWorker(step.workerId, input.autoSpawn);
  const prompt = buildStepPrompt(step, input.task, input.carry);
  const res = await deps.sendToWorker(workerId, prompt, {
    attachments: input.stepIndex === 0 ? input.attachments : undefined,
    timeoutMs: resolveStepTimeout(step, input.limits),
  });
  const stepFinished = Date.now();
  if (!res.success) {
    const result: WorkflowStepResult = {
      id: step.id,
      title: step.title,
      workerId,
      status: "error",
      error: res.error ?? "unknown_error",
      startedAt: stepStarted,
      finishedAt: stepFinished,
      durationMs: stepFinished - stepStarted,
    };
    publishOrchestratorEvent("orchestra.workflow.step", {
      runId: input.runId,
      workflowId: input.workflow.id,
      workflowName: input.workflow.name,
      stepId: step.id,
      stepTitle: step.title,
      workerId,
      status: "error",
      startedAt: stepStarted,
      finishedAt: stepFinished,
      durationMs: stepFinished - stepStarted,
      error: res.error ?? "unknown_error",
    });
    return { step: result, carry: input.carry };
  }

  const response = res.response ?? "";
  const preview = truncateResponse(response);
  const result: WorkflowStepResult = {
    id: step.id,
    title: step.title,
    workerId,
    status: "success",
    response,
    ...(res.warning ? { warning: res.warning } : {}),
    startedAt: stepStarted,
    finishedAt: stepFinished,
    durationMs: stepFinished - stepStarted,
  };
  publishOrchestratorEvent("orchestra.workflow.step", {
    runId: input.runId,
    workflowId: input.workflow.id,
    workflowName: input.workflow.name,
    stepId: step.id,
    stepTitle: step.title,
    workerId,
    status: "success",
    startedAt: stepStarted,
    finishedAt: stepFinished,
    durationMs: stepFinished - stepStarted,
    response: preview.value,
    responseTruncated: preview.truncated,
    ...(res.warning ? { warning: res.warning } : {}),
  });

  const carryBlock = step.carry ? [`### ${step.title}`, response].join("\n") : "";
  const nextCarry = step.carry ? appendCarry(input.carry, carryBlock, input.limits.maxCarryChars) : input.carry;
  return { step: result, response, carry: nextCarry };
}

export async function runWorkflow(
  input: WorkflowRunInput,
  deps: WorkflowRunDependencies
): Promise<WorkflowRunResult> {
  const workflow = getWorkflow(input.workflowId);
  if (!workflow) {
    throw new Error(`Unknown workflow "${input.workflowId}".`);
  }

  validateWorkflowInput(input, workflow);

  const runId = randomUUID();
  const startedAt = Date.now();
  publishOrchestratorEvent("orchestra.workflow.started", {
    runId,
    workflowId: workflow.id,
    workflowName: workflow.name,
    task: input.task,
    startedAt,
  });

  const steps: WorkflowRunResult["steps"] = [];
  let carry = "";
  let status: WorkflowRunResult["status"] = "running";

  for (let i = 0; i < workflow.steps.length; i++) {
    const executed = await executeWorkflowStep(
      {
        runId,
        workflow,
        stepIndex: i,
        task: input.task,
        carry,
        autoSpawn: input.autoSpawn ?? true,
        limits: input.limits,
        attachments: input.attachments,
      },
      deps
    );
    steps.push(executed.step);
    if (executed.step.status === "error") {
      status = "error";
      break;
    }
    carry = executed.carry;
  }

  const finishedAt = Date.now();
  const errorCount = steps.filter((step) => step.status === "error").length;
  publishOrchestratorEvent("orchestra.workflow.completed", {
    runId,
    workflowId: workflow.id,
    workflowName: workflow.name,
    status: errorCount > 0 ? "error" : "success",
    startedAt,
    finishedAt,
    durationMs: finishedAt - startedAt,
    steps: { total: steps.length, success: steps.length - errorCount, error: errorCount },
  });

  return {
    runId,
    workflowId: workflow.id,
    workflowName: workflow.name,
    status: status === "error" ? "error" : "success",
    startedAt,
    finishedAt,
    currentStepIndex: Math.min(steps.length, workflow.steps.length),
    steps,
    lastStepResult: steps[steps.length - 1],
  };
}
