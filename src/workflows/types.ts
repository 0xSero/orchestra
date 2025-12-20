import type { WorkerAttachment } from "../workers/prompt";

export type WorkflowStepResult = {
  stepId: string;
  title: string;
  workerId: string;
  ok: boolean;
  startedAt: string;
  endedAt: string;
  durationMs: number;
  output?: string;
  error?: string;
};

export type WorkflowRunResult = {
  workflowId: string;
  ok: boolean;
  startedAt: string;
  endedAt: string;
  durationMs: number;
  steps: WorkflowStepResult[];
  output: string;
};

export type WorkflowTemplateContext = {
  task: string;
  attachments?: WorkerAttachment[];
  /** Step outputs by stepId */
  outputs: Record<string, string>;
};

export type WorkflowStep = {
  id: string;
  title: string;
  /** Which worker/profile ID should run this step */
  workerId: string;
  /** Max time to wait for this step */
  timeoutMs?: number;
  /** Template to produce the worker prompt */
  prompt: (ctx: WorkflowTemplateContext) => string;
  /** If true, failure aborts the workflow */
  required?: boolean;
};

export type WorkflowDefinition = {
  id: string;
  name: string;
  description: string;
  /** Worker IDs required for this workflow (engine will auto-spawn if needed) */
  requiredWorkers: string[];
  steps: WorkflowStep[];
};

