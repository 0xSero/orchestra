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

export type ModelOption = {
  value: string;
  label: string;
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
  subagents: Accessor<SubagentSession[]>;
  activeSubagent: Accessor<SubagentSession | null>;
  lastSubagentEvent: Accessor<SubagentEvent | null>;
  activeWorkerSessionIds: Accessor<Set<string>>;
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
