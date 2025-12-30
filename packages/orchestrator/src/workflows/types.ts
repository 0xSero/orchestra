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
  error?: string;
  startedAt: number;
  finishedAt: number;
  durationMs: number;
};

export type WorkflowRunResult = {
  workflowId: string;
  workflowName: string;
  startedAt: number;
  finishedAt: number;
  steps: WorkflowStepResult[];
};
