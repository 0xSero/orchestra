import type { Agent, Message, OpencodeClient, Part, Session } from "@opencode-ai/sdk/client";
import type { Accessor } from "solid-js";

export type { Session, Message, Part, Agent };

export type OpenCodeEventItem = {
  id: string;
  type: string;
  payload: unknown;
  at: number;
};

export type WorkerStatus = "starting" | "ready" | "busy" | "error" | "stopped";

export type SubagentSession = {
  workerId: string;
  sessionId: string;
  parentSessionId?: string;
  profile?: { id: string; name: string; model?: string };
  serverUrl?: string;
  status?: string;
};

export type SubagentEvent = {
  type: "active" | "closed";
  subagent: SubagentSession;
  result?: { summary?: string; error?: string };
};

export type WorkerRuntime = {
  id: string;
  name: string;
  status: WorkerStatus;
  sessionId?: string;
  workerSessionId?: string;
  parentSessionId?: string;
  model?: string;
  port?: number;
  serverUrl?: string;
  supportsVision?: boolean;
  supportsWeb?: boolean;
  lastActivity?: string;
  currentTask?: string;
  lastResult?: {
    at?: string;
    jobId?: string;
    response?: string;
    report?: {
      summary?: string;
      details?: string;
      issues?: string[];
      notes?: string;
    };
    durationMs?: number;
  };
  error?: string;
  warning?: string;
};

/** Streaming response from a delegated worker */
export type WorkerStreamChunk = {
  workerId: string;
  jobId?: string;
  chunk: string;
  timestamp: number;
  final?: boolean;
};

export type OrchestratorEventType =
  | "orchestra.worker.status"
  | "orchestra.worker.stream"
  | "orchestra.workflow.started"
  | "orchestra.workflow.step"
  | "orchestra.workflow.completed"
  | "orchestra.workflow.carry.trimmed"
  | "orchestra.memory.written"
  | "orchestra.skill.load.started"
  | "orchestra.skill.load.completed"
  | "orchestra.skill.load.failed"
  | "orchestra.skill.permission"
  | "orchestra.job.created"
  | "orchestra.job.progress"
  | "orchestra.job.completed"
  | "orchestra.job.failed"
  | "orchestra.job.canceled"
  | "orchestra.error";

export type OrchestratorEvent = {
  version: number;
  id: string;
  type: OrchestratorEventType;
  timestamp: number;
  data: Record<string, unknown>;
};

export type SkillEventSource = "in-process" | "server";

export type SkillLoadEvent = {
  id: string;
  type: "orchestra.skill.load.started" | "orchestra.skill.load.completed" | "orchestra.skill.load.failed";
  skillName?: string;
  sessionId?: string;
  callId?: string;
  workerId?: string;
  workerKind?: string;
  workflowRunId?: string;
  workflowStepId?: string;
  source?: SkillEventSource;
  timestamp: number;
  durationMs?: number;
  outputBytes?: number;
  status?: "success" | "error";
};

export type WorkflowRunStatus = "running" | "success" | "error";

export type WorkflowCarryTrim = {
  droppedBlocks: number;
  truncatedSections: string[];
  maxCarryChars: number;
  at: number;
};

export type WorkflowRunStep = {
  stepId: string;
  stepTitle?: string;
  workerId: string;
  status: "success" | "error";
  startedAt: number;
  finishedAt: number;
  durationMs: number;
  response?: string;
  responseTruncated?: boolean;
  warning?: string;
  carryTrim?: WorkflowCarryTrim;
  error?: string;
};

export type WorkflowRun = {
  runId: string;
  workflowId: string;
  workflowName?: string;
  status: WorkflowRunStatus;
  startedAt: number;
  finishedAt?: number;
  durationMs?: number;
  steps: WorkflowRunStep[];
};

export type ModelOption = {
  value: string;
  label: string;
};

export type JobStatus = "running" | "succeeded" | "failed" | "canceled";

export type JobRecord = {
  id: string;
  workerId: string;
  message: string;
  sessionId?: string;
  requestedBy?: string;
  status: JobStatus;
  startedAt: number;
  finishedAt?: number;
  durationMs?: number;
  responseText?: string;
  responsePreview?: string;
  responseLength?: number;
  error?: string;
  progress?: {
    message: string;
    percent?: number;
    updatedAt: number;
  };
};

export type JobSummary = {
  total: number;
  running: number;
  succeeded: number;
  failed: number;
  canceled: number;
  oldestRunningMs?: number;
};

export interface OpenCodeState {
  connected: boolean;
  version: string | null;
  sessions: Record<string, Session>;
  messages: Record<string, Message[]>;
  parts: Record<string, Part[]>;
  agents: Agent[];
  events: OpenCodeEventItem[];
  workers: Record<string, WorkerRuntime>;
  subagents: Record<string, SubagentSession>;
  lastSubagentEvent: SubagentEvent | null;
  /** Active worker stream chunks (keyed by workerId) */
  workerStreams: Record<string, WorkerStreamChunk>;
  workflowRuns: Record<string, WorkflowRun>;
  skillEvents: SkillLoadEvent[];
  /** Job records from orchestrator */
  jobs: Record<string, JobRecord>;
  /** Job summary from orchestrator */
  jobSummary: JobSummary | null;
  modelOptions: ModelOption[];
  toolIds: string[];
  lastUpdate: number;
}

export interface OpenCodeContextValue {
  connected: Accessor<boolean>;
  version: Accessor<string | null>;

  sessions: Accessor<Session[]>;
  agents: Accessor<Agent[]>;
  events: Accessor<OpenCodeEventItem[]>;
  workers: Accessor<WorkerRuntime[]>;
  /** Active worker stream chunks for live display */
  workerStreams: Accessor<WorkerStreamChunk[]>;
  workflowRuns: Accessor<WorkflowRun[]>;
  skillEvents: Accessor<SkillLoadEvent[]>;
  subagents: Accessor<SubagentSession[]>;
  activeSubagent: Accessor<SubagentSession | null>;
  lastSubagentEvent: Accessor<SubagentEvent | null>;
  activeWorkerSessionIds: Accessor<Set<string>>;
  /** Job records from orchestrator */
  jobs: Accessor<JobRecord[]>;
  /** Job summary from orchestrator */
  jobSummary: Accessor<JobSummary | null>;
  modelOptions: Accessor<ModelOption[]>;
  toolIds: Accessor<string[]>;

  getSession: (id: string) => Session | undefined;
  getSessionMessages: (id: string) => Message[];
  getMessageParts: (messageId: string) => Part[];

  refresh: () => Promise<void>;
  refreshSessions: () => Promise<void>;
  fetchMessages: (id: string) => Promise<void>;
  refreshCatalog: () => Promise<void>;
  createSession: () => Promise<Session | null>;
  deleteSession: (id: string) => Promise<boolean>;
  sendMessage: (
    sessionId: string,
    content: string,
    attachments?: Array<{
      id?: string;
      type: "file" | "image";
      name?: string;
      size?: number;
      url?: string;
      file?: File;
    }>,
  ) => Promise<void>;
  abortSession: (id: string) => Promise<boolean>;
  abortAllSessions: () => Promise<number>;
  deleteAllSessions: () => Promise<number>;
  disposeAllInstances: () => Promise<boolean>;
  hydrateWorkers: (states: import("@/types/db").WorkerState[]) => void;

  client: OpencodeClient;
}
