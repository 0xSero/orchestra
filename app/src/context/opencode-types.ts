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

export type WorkerRuntime = {
  id: string;
  name: string;
  status: WorkerStatus;
  sessionId?: string;
  model?: string;
  port?: number;
  serverUrl?: string;
  supportsVision?: boolean;
  supportsWeb?: boolean;
  lastActivity?: string;
  error?: string;
  warning?: string;
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

  client: OpencodeClient;
}
