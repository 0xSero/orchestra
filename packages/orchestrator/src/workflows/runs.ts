import type {
  WorkflowAttachment,
  WorkflowRunResult,
  WorkflowRunStatus,
  WorkflowSecurityLimits,
  WorkflowStepResult,
} from "./types";
import type { WorkflowUiPolicy } from "../types";

export type WorkflowRunState = {
  runId: string;
  workflowId: string;
  workflowName: string;
  task: string;
  autoSpawn: boolean;
  limits: WorkflowSecurityLimits;
  attachments?: WorkflowAttachment[];
  ui: WorkflowUiPolicy;
  status: WorkflowRunStatus;
  currentStepIndex: number;
  steps: WorkflowStepResult[];
  lastStepResult?: WorkflowStepResult;
  carry: string;
  startedAt: number;
  finishedAt?: number;
  updatedAt: number;
  parentSessionId?: string;
};

const runs = new Map<string, WorkflowRunState>();

export function createWorkflowRunState(input: {
  runId: string;
  workflowId: string;
  workflowName: string;
  task: string;
  autoSpawn: boolean;
  limits: WorkflowSecurityLimits;
  attachments?: WorkflowAttachment[];
  ui: WorkflowUiPolicy;
  parentSessionId?: string;
}): WorkflowRunState {
  const now = Date.now();
  return {
    runId: input.runId,
    workflowId: input.workflowId,
    workflowName: input.workflowName,
    task: input.task,
    autoSpawn: input.autoSpawn,
    limits: input.limits,
    attachments: input.attachments,
    ui: input.ui,
    status: "running",
    currentStepIndex: 0,
    steps: [],
    carry: "",
    startedAt: now,
    updatedAt: now,
    ...(input.parentSessionId ? { parentSessionId: input.parentSessionId } : {}),
  };
}

export function saveWorkflowRun(state: WorkflowRunState): void {
  runs.set(state.runId, state);
}

export function getWorkflowRun(runId: string): WorkflowRunState | undefined {
  return runs.get(runId);
}

export function deleteWorkflowRun(runId: string): void {
  runs.delete(runId);
}

export function toWorkflowRunResult(state: WorkflowRunState): WorkflowRunResult {
  return {
    runId: state.runId,
    workflowId: state.workflowId,
    workflowName: state.workflowName,
    status: state.status,
    startedAt: state.startedAt,
    finishedAt: state.finishedAt,
    currentStepIndex: state.currentStepIndex,
    steps: state.steps,
    lastStepResult: state.lastStepResult,
    ui: state.ui,
  };
}
