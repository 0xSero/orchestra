import type { WorkflowUiPolicy } from "../types";

export type WorkflowAttachment = {
  type: "image" | "file";
  path?: string;
  base64?: string;
  mimeType?: string;
};

export type WorkflowStepDefinition = {
  id: string;
  title: string;
  workerId: string;
  prompt: string;
  carry?: boolean;
  timeoutMs?: number;
};

export type WorkflowDefinition = {
  id: string;
  name: string;
  description: string;
  steps: WorkflowStepDefinition[];
};

export type WorkflowSecurityLimits = {
  maxSteps: number;
  maxTaskChars: number;
  maxCarryChars: number;
  perStepTimeoutMs: number;
};

export type WorkflowRunInput = {
  workflowId: string;
  task: string;
  attachments?: WorkflowAttachment[];
  autoSpawn?: boolean;
  limits: WorkflowSecurityLimits;
};

export type WorkflowStepResult = {
  id: string;
  title: string;
  workerId: string;
  status: "success" | "error";
  response?: string;
  warning?: string;
  error?: string;
  jobId?: string;
  startedAt: number;
  finishedAt: number;
  durationMs: number;
};

export type WorkflowRunStatus = "running" | "paused" | "success" | "error";

export type WorkflowRunResult = {
  runId: string;
  workflowId: string;
  workflowName: string;
  status: WorkflowRunStatus;
  startedAt: number;
  finishedAt?: number;
  currentStepIndex: number;
  steps: WorkflowStepResult[];
  lastStepResult?: WorkflowStepResult;
  ui?: WorkflowUiPolicy;
};
