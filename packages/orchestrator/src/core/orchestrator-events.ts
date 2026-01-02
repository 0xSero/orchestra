import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import type {
  WorkerBackend,
  WorkerExecution,
  WorkerInstance,
  WorkerKind,
  WorkerStatus,
} from "../types";

export const ORCHESTRATOR_EVENT_VERSION = 1 as const;

export type OrchestratorEventType =
  | "orchestra.worker.status"
  | "orchestra.worker.stream"
  | "orchestra.workflow.started"
  | "orchestra.workflow.step"
  | "orchestra.workflow.carry.trimmed"
  | "orchestra.workflow.completed"
  | "orchestra.memory.written"
  | "orchestra.skill.load.started"
  | "orchestra.skill.load.completed"
  | "orchestra.skill.load.failed"
  | "orchestra.skill.permission"
  | "orchestra.error";

export type OrchestratorSkillLoadEvent = {
  sessionId: string;
  callId: string;
  skillName?: string;
  worker?: { id: string; kind?: WorkerKind };
  workflow?: { runId?: string; stepId?: string };
  source: "in-process" | "server";
  timestamp: number;
  durationMs?: number;
  outputBytes?: number;
  metadata?: Record<string, unknown>;
};

export type OrchestratorSkillPermissionEvent = {
  sessionId: string;
  permissionId: string;
  callId?: string;
  status: "allow" | "ask" | "deny";
  pattern?: string | string[];
  skillName?: string;
  worker?: { id: string; kind?: WorkerKind };
  source: "in-process" | "server";
  timestamp: number;
};

export type OrchestratorWorkerSnapshot = {
  id: string;
  name: string;
  status: WorkerStatus;
  backend: WorkerBackend;
  kind?: WorkerKind;
  execution?: WorkerExecution;
  parentSessionId?: string;
  model: string;
  modelResolution?: string;
  purpose?: string;
  whenToUse?: string;
  port?: number;
  pid?: number;
  serverUrl?: string;
  sessionId?: string;
  supportsVision?: boolean;
  supportsWeb?: boolean;
  lastActivity?: string;
  currentTask?: string;
  warning?: string;
  error?: string;
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
};

export type OrchestratorEventDataMap = {
  "orchestra.worker.status": {
    worker: OrchestratorWorkerSnapshot;
    status: WorkerStatus;
    previousStatus?: WorkerStatus;
    reason?: string;
  };
  "orchestra.worker.stream": {
    chunk: {
      workerId: string;
      jobId?: string;
      chunk: string;
      timestamp: number;
      final?: boolean;
    };
  };
  "orchestra.workflow.started": {
    runId: string;
    workflowId: string;
    workflowName?: string;
    task?: string;
    startedAt: number;
  };
  "orchestra.workflow.step": {
    runId: string;
    workflowId: string;
    workflowName?: string;
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
    jobId?: string;
    error?: string;
  };
  "orchestra.workflow.carry.trimmed": {
    runId: string;
    workflowId: string;
    workflowName?: string;
    stepId: string;
    stepTitle?: string;
    maxCarryChars: number;
    droppedBlocks: number;
    truncatedSections: string[];
  };
  "orchestra.workflow.completed": {
    runId: string;
    workflowId: string;
    workflowName?: string;
    status: "success" | "error";
    startedAt: number;
    finishedAt: number;
    durationMs: number;
    steps: { total: number; success: number; error: number };
  };
  "orchestra.memory.written": {
    action: "put" | "link";
    scope: "project" | "global";
    projectId?: string;
    taskId?: string;
    key?: string;
    tags?: string[];
    fromKey?: string;
    toKey?: string;
    relation?: string;
  };
  "orchestra.skill.load.started": OrchestratorSkillLoadEvent;
  "orchestra.skill.load.completed": OrchestratorSkillLoadEvent;
  "orchestra.skill.load.failed": OrchestratorSkillLoadEvent;
  "orchestra.skill.permission": OrchestratorSkillPermissionEvent;
  "orchestra.error": {
    message: string;
    source?: string;
    details?: string;
    workerId?: string;
    workflowId?: string;
    runId?: string;
    stepId?: string;
  };
};

export type OrchestratorEvent<
  T extends OrchestratorEventType = OrchestratorEventType,
> = {
  version: typeof ORCHESTRATOR_EVENT_VERSION;
  id: string;
  type: T;
  timestamp: number;
  data: OrchestratorEventDataMap[T];
};

const emitter = new EventEmitter();
emitter.setMaxListeners(100);

function resolveWorkerBackend(
  profile: WorkerInstance["profile"],
): WorkerBackend {
  if (profile.kind === "server") return "server";
  if (profile.kind === "agent" || profile.kind === "subagent") return "agent";
  return profile.backend ?? "server";
}

export function serializeWorkerInstance(
  instance: WorkerInstance,
  overrides?: { status?: WorkerStatus },
): OrchestratorWorkerSnapshot {
  const status = overrides?.status ?? instance.status;
  return {
    id: instance.profile.id,
    name: instance.profile.name,
    status,
    backend: resolveWorkerBackend(instance.profile),
    kind: instance.kind ?? instance.profile.kind,
    execution: instance.execution ?? instance.profile.execution,
    parentSessionId: instance.parentSessionId,
    model: instance.profile.model,
    modelResolution: instance.modelResolution,
    purpose: instance.profile.purpose,
    whenToUse: instance.profile.whenToUse,
    port: instance.port,
    pid: instance.pid,
    serverUrl: instance.serverUrl,
    sessionId: instance.sessionId,
    supportsVision: instance.profile.supportsVision ?? false,
    supportsWeb: instance.profile.supportsWeb ?? false,
    lastActivity: instance.lastActivity?.toISOString(),
    currentTask: instance.currentTask,
    warning: instance.warning,
    error: instance.error,
    lastResult: instance.lastResult
      ? {
          at: instance.lastResult.at.toISOString(),
          jobId: instance.lastResult.jobId,
          response: instance.lastResult.response,
          report: instance.lastResult.report,
          durationMs: instance.lastResult.durationMs,
        }
      : undefined,
  };
}

export function createOrchestratorEvent<T extends OrchestratorEventType>(
  type: T,
  data: OrchestratorEventDataMap[T],
  options?: { id?: string; timestamp?: number },
): OrchestratorEvent<T> {
  return {
    version: ORCHESTRATOR_EVENT_VERSION,
    id: options?.id ?? randomUUID(),
    type,
    timestamp: options?.timestamp ?? Date.now(),
    data,
  };
}

export function publishOrchestratorEvent<T extends OrchestratorEventType>(
  type: T,
  data: OrchestratorEventDataMap[T],
  options?: { id?: string; timestamp?: number },
): OrchestratorEvent<T> {
  const event = createOrchestratorEvent(type, data, options);
  emitter.emit("event", event);
  return event;
}

export function publishWorkerStatusEvent(input: {
  instance: WorkerInstance;
  previousStatus?: WorkerStatus;
  status?: WorkerStatus;
  reason?: string;
}): OrchestratorEvent<"orchestra.worker.status"> {
  const worker = serializeWorkerInstance(input.instance, {
    status: input.status,
  });
  return publishOrchestratorEvent("orchestra.worker.status", {
    worker,
    status: worker.status,
    previousStatus: input.previousStatus,
    reason: input.reason,
  });
}

export function publishErrorEvent(input: {
  message: string;
  source?: string;
  details?: string;
  workerId?: string;
  workflowId?: string;
  runId?: string;
  stepId?: string;
}): OrchestratorEvent<"orchestra.error"> {
  return publishOrchestratorEvent("orchestra.error", {
    message: input.message,
    source: input.source,
    details: input.details,
    workerId: input.workerId,
    workflowId: input.workflowId,
    runId: input.runId,
    stepId: input.stepId,
  });
}

export function onOrchestratorEvent(
  handler: (event: OrchestratorEvent) => void,
): () => void {
  emitter.on("event", handler);
  return () => emitter.off("event", handler);
}
