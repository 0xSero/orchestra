import type { Event as OpenCodeEvent } from "@opencode-ai/sdk";
import type { Skill, SkillScope, WorkerForwardEvent, WorkerInstance, WorkerSessionMode } from "../types";
import type { WorkerJob } from "../workers/jobs";

export type OrchestraEventMeta = {
  source: "orchestrator" | "worker" | "sdk" | "session-manager" | "event-forwarding" | "vision";
  sessionId?: string;
  workerId?: string;
  jobId?: string;
};

// Session-related event payloads
export type SessionCreatedPayload = {
  session: {
    workerId: string;
    sessionId: string;
    mode: WorkerSessionMode;
    parentSessionId?: string;
    serverUrl?: string;
    createdAt: string;
    lastActivity: string;
    status: string;
    messageCount: number;
    toolCount: number;
    recentActivityCount: number;
    error?: string;
  };
};

export type SessionActivityPayload = {
  sessionId: string;
  workerId: string;
  activity: {
    id: string;
    type: WorkerForwardEvent;
    timestamp: string;
    summary: string;
  };
};

export type SessionStatusPayload = {
  sessionId: string;
  workerId: string;
  status: string;
  error?: string;
};

export type SessionClosedPayload = {
  sessionId: string;
  workerId: string;
};

export type SessionErrorPayload = {
  workerId: string;
  sessionId?: string;
  error: string;
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
  "orchestra.vision.started": { sessionId: string; messageId?: string };
  "orchestra.vision.completed": { success: boolean; error?: string; durationMs?: number };
  // Session events
  "orchestra.session.created": SessionCreatedPayload;
  "orchestra.session.activity": SessionActivityPayload;
  "orchestra.session.status": SessionStatusPayload;
  "orchestra.session.closed": SessionClosedPayload;
  "orchestra.session.error": SessionErrorPayload;
  // Skill events
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
