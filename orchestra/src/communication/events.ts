import type { Event as OpenCodeEvent } from "@opencode-ai/sdk";
import type { Skill, SkillScope, WorkerInstance } from "../types";
import type { WorkerJob } from "../workers/jobs";

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

export type ModelResolution = {
  profileId: string;
  from: string;
  to: string;
  reason: string;
};

export type OrchestraEventMap = {
  "orchestra.server.event": { event: OpenCodeEvent };
  "orchestra.started": { profileCount: number; autoSpawn: string[]; fallbackModel?: string };
  "orchestra.model.resolved": { resolution: ModelResolution };
  "orchestra.model.fallback": { profileId: string; model: string; reason: string };
  "orchestra.worker.spawned": { worker: WorkerInstance };
  "orchestra.worker.reused": { worker: WorkerInstance };
  "orchestra.worker.ready": { worker: WorkerInstance };
  "orchestra.worker.busy": { worker: WorkerInstance };
  "orchestra.worker.error": { worker: WorkerInstance; error: string };
  "orchestra.worker.stopped": { worker: WorkerInstance };
  "orchestra.worker.job": { job: WorkerJob; status: "created" | "succeeded" | "failed" };
  "orchestra.worker.stream": { chunk: StreamChunk };
  "orchestra.worker.response": { worker: WorkerInstance; response: string; jobId?: string };
  "orchestra.worker.wakeup": { workerId: string; jobId?: string; reason: string; summary?: string };
  "skill.created": { skill: Skill };
  "skill.updated": { skill: Skill };
  "skill.deleted": { id: string; scope: SkillScope };
};

export type OrchestraEventName = keyof OrchestraEventMap;

export type OrchestraEvent<T extends OrchestraEventName> = {
  type: T;
  meta: OrchestraEventMeta;
  data: OrchestraEventMap[T];
};
