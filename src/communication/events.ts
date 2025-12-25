import type { Event as OpenCodeEvent } from "@opencode-ai/sdk";
import type { WorkerInstance } from "../types";

export type OrchestraEventMeta = {
  source: "orchestrator" | "worker" | "sdk";
  sessionId?: string;
  workerId?: string;
  jobId?: string;
};

export type StreamChunk = {
  workerId: string;
  jobId?: string;
  chunk: string;
  timestamp: number;
  final?: boolean;
};

export type OrchestraEventMap = {
  "orchestra.server.event": { event: OpenCodeEvent };
  "orchestra.worker.spawned": { worker: WorkerInstance };
  "orchestra.worker.ready": { worker: WorkerInstance };
  "orchestra.worker.busy": { worker: WorkerInstance };
  "orchestra.worker.error": { worker: WorkerInstance; error: string };
  "orchestra.worker.stopped": { worker: WorkerInstance };
  "orchestra.worker.stream": { chunk: StreamChunk };
  "orchestra.worker.response": { worker: WorkerInstance; response: string; jobId?: string };
  "orchestra.worker.wakeup": { workerId: string; jobId?: string; reason: string; summary?: string };
};

export type OrchestraEventName = keyof OrchestraEventMap;

export type OrchestraEvent<T extends OrchestraEventName> = {
  type: T;
  meta: OrchestraEventMeta;
  data: OrchestraEventMap[T];
};
