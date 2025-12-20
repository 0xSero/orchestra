import type { WorkerAttachment } from "../../workers/prompt";

export type WorkflowId = string;

export type WorkflowStepResult = {
  stepId: string;
  workerId: string;
  ok: boolean;
  requestChars: number;
  responseChars: number;
  durationMs: number;
  responseText?: string;
  error?: string;
};

export type WorkflowRunResult<TOutput = unknown> = {
  workflowId: WorkflowId;
  ok: boolean;
  output?: TOutput;
  error?: string;
  steps: WorkflowStepResult[];
  metrics: {
    totalDurationMs: number;
    totalRequestChars: number;
    totalResponseChars: number;
    startedAt: string;
    finishedAt: string;
  };
};

export type WorkflowRunSecurity = {
  /** Max workflow steps executed (default: 12). */
  maxSteps?: number;
  /** Max chars allowed for the initial user task (default: 12k). */
  maxTaskChars?: number;
  /** Max chars to carry forward between steps (default: 24k). */
  maxCarryChars?: number;
  /** Per-step prompt timeout (default: 120s). */
  perStepTimeoutMs?: number;
};

export type WorkflowRunInput = {
  task: string;
  attachments?: WorkerAttachment[];
};

export type WorkflowContext = {
  directory: string;
  worktree?: string;
  projectId?: string;
  profiles: Record<string, { id: string; model: string }>;
  ensureWorker: (profileId: string, ctx?: { sessionID?: string }) => Promise<{ workerId: string }>;
  askWorker: (workerId: string, message: string, opts?: { attachments?: WorkerAttachment[]; timeoutMs?: number }) => Promise<string>;
};

export type WorkflowDefinition<TInput extends WorkflowRunInput = WorkflowRunInput, TOutput = unknown> = {
  id: WorkflowId;
  title: string;
  description: string;
  run: (ctx: WorkflowContext, input: TInput, opts?: { security?: WorkflowRunSecurity }) => Promise<WorkflowRunResult<TOutput>>;
};

