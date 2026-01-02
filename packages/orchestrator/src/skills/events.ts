import { Buffer } from "node:buffer";
import type { WorkerKind } from "../types";

export type SkillEventSource = "in-process" | "server";

export type SkillEventContext = {
  workerId?: string;
  workerKind?: WorkerKind;
  workflowRunId?: string;
  workflowStepId?: string;
  source?: SkillEventSource;
};

export type SkillRequestedPayload = {
  sessionId: string;
  callId: string;
  skillName?: string;
  worker?: { id: string; kind?: WorkerKind };
  workflow?: { runId?: string; stepId?: string };
  source: SkillEventSource;
  timestamp: number;
};

export type SkillCompletedPayload = SkillRequestedPayload & {
  status: "success" | "error";
  durationMs?: number;
  outputBytes?: number;
  metadata?: Record<string, unknown>;
};

export type SkillPermissionPayload = {
  sessionId: string;
  permissionId: string;
  callId?: string;
  status: "allow" | "ask" | "deny";
  pattern?: string | string[];
  skillName?: string;
  worker?: { id: string; kind?: WorkerKind };
  source: SkillEventSource;
  timestamp: number;
};

const normalizeSource = (context?: SkillEventContext): SkillEventSource =>
  context?.source ?? "in-process";

const normalizeWorker = (
  context?: SkillEventContext,
): SkillRequestedPayload["worker"] | undefined => {
  if (!context?.workerId) return undefined;
  return {
    id: context.workerId,
    ...(context.workerKind ? { kind: context.workerKind } : {}),
  };
};

const normalizeWorkflow = (
  context?: SkillEventContext,
): SkillRequestedPayload["workflow"] | undefined => {
  if (!context?.workflowRunId && !context?.workflowStepId) return undefined;
  return {
    ...(context?.workflowRunId ? { runId: context.workflowRunId } : {}),
    ...(context?.workflowStepId ? { stepId: context.workflowStepId } : {}),
  };
};

const sanitizeMetadata = (
  metadata: unknown,
): Record<string, unknown> | undefined => {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata))
    return undefined;
  return { ...(metadata as Record<string, unknown>) };
};

export const getSkillNameFromArgs = (args: unknown): string | undefined => {
  if (!args || typeof args !== "object") return undefined;
  const raw = (args as { name?: unknown }).name;
  return typeof raw === "string" ? raw : undefined;
};

export const buildSkillRequestedPayload = (input: {
  sessionId: string;
  callId: string;
  args?: unknown;
  context?: SkillEventContext;
  timestamp?: number;
}): SkillRequestedPayload => {
  return {
    sessionId: input.sessionId,
    callId: input.callId,
    skillName: getSkillNameFromArgs(input.args),
    worker: normalizeWorker(input.context),
    workflow: normalizeWorkflow(input.context),
    source: normalizeSource(input.context),
    timestamp: input.timestamp ?? Date.now(),
  };
};

export const buildSkillCompletedPayload = (input: {
  sessionId: string;
  callId: string;
  args?: unknown;
  status: "success" | "error";
  durationMs?: number;
  output?: string;
  metadata?: unknown;
  context?: SkillEventContext;
  timestamp?: number;
}): SkillCompletedPayload => {
  const outputBytes =
    typeof input.output === "string"
      ? Buffer.byteLength(input.output)
      : undefined;
  const metadata = sanitizeMetadata(input.metadata);
  return {
    ...buildSkillRequestedPayload({
      sessionId: input.sessionId,
      callId: input.callId,
      args: input.args,
      context: input.context,
      timestamp: input.timestamp,
    }),
    status: input.status,
    durationMs: input.durationMs,
    outputBytes,
    ...(metadata ? { metadata } : {}),
  };
};

export const buildSkillPermissionPayload = (input: {
  sessionId: string;
  permissionId: string;
  callId?: string;
  status: "allow" | "ask" | "deny";
  pattern?: string | string[];
  skillName?: string;
  context?: SkillEventContext;
  timestamp?: number;
}): SkillPermissionPayload => {
  return {
    sessionId: input.sessionId,
    permissionId: input.permissionId,
    callId: input.callId,
    status: input.status,
    pattern: input.pattern,
    skillName: input.skillName,
    worker: normalizeWorker(input.context),
    source: normalizeSource(input.context),
    timestamp: input.timestamp ?? Date.now(),
  };
};
