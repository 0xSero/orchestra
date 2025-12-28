import type { CommunicationService } from "../communication";
import type { WorkerInstance } from "../types";
import type { WorkerManager } from "../workers";

export type VisionPart = {
  type?: string;
  url?: string;
  base64?: string;
  mime?: string;
  mimeType?: string;
  text?: string;
  id?: string;
  sessionID?: string;
  messageID?: string;
  synthetic?: boolean;
};

export type VisionRoutingState = {
  processedMessageIds: Set<string>;
};

export type VisionRoutingDeps = {
  workers: Pick<WorkerManager, "getWorker" | "spawnById" | "send" | "jobs" | "stopWorker">;
  ensureWorker?: (input: { workerId: string; reason: "manual" | "on-demand" }) => Promise<WorkerInstance>;
  profiles: Record<string, { id: string; name?: string; model?: string; supportsVision?: boolean }>;
  communication?: Pick<CommunicationService, "emit">;
  timeoutMs?: number;
  prompt?: string;
  logSink?: (entry: Record<string, unknown>) => Promise<void> | void;
  /** If true, stop the vision worker after successful analysis. Default: true */
  autoStopVisionWorker?: boolean;
};

export type VisionChatInput = {
  sessionID: string;
  agent?: string;
  messageID?: string;
  role?: string;
};

export type VisionChatOutput = {
  message?: { role?: string };
  parts: VisionPart[];
};
