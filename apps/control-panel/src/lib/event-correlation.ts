/**
 * Event Correlation - Grouping and filtering events for observability
 *
 * Provides utilities to correlate OpenCode and orchestrator events by
 * sessionId, workerId, runId, taskId, etc. for timeline visualization.
 */

import type { OpenCodeEventItem } from "@/context/opencode-types";

/** Event family categories for filtering */
export type EventFamily = "session" | "message" | "orchestra" | "unknown";

/** Correlation IDs that can be extracted from events */
export type CorrelationIds = {
  sessionId?: string;
  workerId?: string;
  workflowId?: string;
  runId?: string;
  stepId?: string;
  jobId?: string;
  taskId?: string;
};

/** Event with enriched correlation metadata */
export type CorrelatedEvent = {
  event: OpenCodeEventItem;
  family: EventFamily;
  correlationIds: CorrelationIds;
  description: string;
};

/** Type guard for record objects */
const asRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

/**
 * Determine the event family from the event type string.
 */
export function getEventFamily(type: string): EventFamily {
  if (type.startsWith("session.")) return "session";
  if (type.startsWith("message.")) return "message";
  if (type.startsWith("orchestra.")) return "orchestra";
  return "unknown";
}

/**
 * Extract correlation IDs from an event payload.
 * Handles various event structures safely.
 */
export function extractCorrelationIds(event: OpenCodeEventItem): CorrelationIds {
  const ids: CorrelationIds = {};
  const payload = event.payload;

  if (!asRecord(payload)) return ids;

  const payloadType = typeof payload.type === "string" ? payload.type : event.type;
  const props = asRecord(payload.properties) ? payload.properties : {};
  const data = asRecord(payload.data) ? payload.data : {};

  // Session events: sessionId from properties.id or properties.sessionId
  if (payloadType.startsWith("session.")) {
    if (typeof props.id === "string") ids.sessionId = props.id;
    if (typeof props.sessionId === "string") ids.sessionId = props.sessionId;
  }

  // Message events: sessionId from properties.sessionId
  if (payloadType.startsWith("message.")) {
    if (typeof props.sessionId === "string") ids.sessionId = props.sessionId;
  }

  // Orchestra worker events
  if (payloadType === "orchestra.worker.status") {
    const worker = asRecord(data.worker) ? data.worker : undefined;
    if (worker && typeof worker.id === "string") ids.workerId = worker.id;
  }

  if (payloadType === "orchestra.worker.stream") {
    const chunk = asRecord(data.chunk) ? data.chunk : undefined;
    if (chunk && typeof chunk.workerId === "string") ids.workerId = chunk.workerId;
  }

  // Orchestra workflow events
  if (payloadType.startsWith("orchestra.workflow.")) {
    if (typeof data.workflowId === "string") ids.workflowId = data.workflowId;
    if (typeof data.runId === "string") ids.runId = data.runId;
    if (typeof data.stepId === "string") ids.stepId = data.stepId;
  }

  // Orchestra job events
  if (payloadType.startsWith("orchestra.job.")) {
    if (typeof data.jobId === "string") ids.jobId = data.jobId;
    if (typeof data.taskId === "string") ids.taskId = data.taskId;
    if (typeof data.workerId === "string") ids.workerId = data.workerId;
  }

  return ids;
}

/**
 * Filter events by one or more event families.
 * Returns all events if families array is empty.
 */
export function filterEventsByFamily(
  events: OpenCodeEventItem[],
  families: EventFamily[],
): OpenCodeEventItem[] {
  if (families.length === 0) return events;

  return events.filter((event) => {
    const payload = event.payload;
    const type = asRecord(payload) && typeof payload.type === "string" ? payload.type : event.type;
    const family = getEventFamily(type);
    return families.includes(family);
  });
}

/**
 * Group events by a specific correlation ID.
 * Events without the specified ID are placed in "__uncorrelated".
 * Events within each group are sorted by timestamp.
 */
export function groupEventsByCorrelationId(
  events: OpenCodeEventItem[],
  idType: keyof CorrelationIds,
): Record<string, OpenCodeEventItem[]> {
  const groups: Record<string, OpenCodeEventItem[]> = {};

  for (const event of events) {
    const ids = extractCorrelationIds(event);
    const id = ids[idType] ?? "__uncorrelated";

    if (!groups[id]) groups[id] = [];
    groups[id].push(event);
  }

  // Sort events within each group by timestamp
  for (const id of Object.keys(groups)) {
    groups[id].sort((a, b) => a.at - b.at);
  }

  return groups;
}

/**
 * Generate a human-readable description of an event.
 */
export function describeEvent(event: OpenCodeEventItem): string {
  const payload = event.payload;
  if (!asRecord(payload)) return event.type;

  const payloadType = typeof payload.type === "string" ? payload.type : event.type;
  const props = asRecord(payload.properties) ? payload.properties : {};
  const data = asRecord(payload.data) ? payload.data : {};

  // Session events
  if (payloadType.startsWith("session.")) {
    const info = asRecord(props.info) ? props.info : undefined;
    if (info && typeof info.title === "string") {
      return `${payloadType}: ${info.title}`;
    }
    return payloadType;
  }

  // Message events
  if (payloadType === "message.updated") {
    const info = asRecord(props.info) ? props.info : undefined;
    if (info && typeof info.role === "string") {
      return `${payloadType}: ${info.role}`;
    }
    return payloadType;
  }

  // Orchestra worker status
  if (payloadType === "orchestra.worker.status") {
    const worker = asRecord(data.worker) ? data.worker : undefined;
    const workerId = worker && typeof worker.id === "string" ? worker.id : "worker";
    const status = typeof data.status === "string" ? data.status : "status";
    return `${payloadType}: ${workerId} ${status}`;
  }

  // Orchestra worker stream
  if (payloadType === "orchestra.worker.stream") {
    const chunk = asRecord(data.chunk) ? data.chunk : undefined;
    const workerId = chunk && typeof chunk.workerId === "string" ? chunk.workerId : "worker";
    return `${payloadType}: ${workerId}`;
  }

  // Orchestra workflow step
  if (payloadType === "orchestra.workflow.step") {
    const workflowId = typeof data.workflowId === "string" ? data.workflowId : "workflow";
    const stepId = typeof data.stepId === "string" ? data.stepId : "step";
    return `${payloadType}: ${workflowId}/${stepId}`;
  }

  // Orchestra workflow carry trimmed
  if (payloadType === "orchestra.workflow.carry.trimmed") {
    const workflowId = typeof data.workflowId === "string" ? data.workflowId : "workflow";
    const stepId = typeof data.stepId === "string" ? data.stepId : "step";
    const dropped = typeof data.droppedBlocks === "number" ? data.droppedBlocks : undefined;
    const suffix = dropped !== undefined ? ` dropped=${dropped}` : "";
    return `${payloadType}: ${workflowId}/${stepId}${suffix}`;
  }

  // Orchestra workflow events (generic)
  if (payloadType.startsWith("orchestra.workflow.")) {
    const workflowId = typeof data.workflowId === "string" ? data.workflowId : undefined;
    if (workflowId) return `${payloadType}: ${workflowId}`;
    return payloadType;
  }

  // Orchestra job events
  if (payloadType.startsWith("orchestra.job.")) {
    const workerId = typeof data.workerId === "string" ? data.workerId : "worker";
    const jobId = typeof data.jobId === "string" ? data.jobId : undefined;
    return jobId ? `${payloadType}: ${workerId} ${jobId}` : `${payloadType}: ${workerId}`;
  }

  // Orchestra memory events
  if (payloadType === "orchestra.memory.written") {
    const key = typeof data.key === "string" ? data.key : undefined;
    const fromKey = typeof data.fromKey === "string" ? data.fromKey : undefined;
    const toKey = typeof data.toKey === "string" ? data.toKey : undefined;
    if (key) return `${payloadType}: ${key}`;
    if (fromKey && toKey) return `${payloadType}: ${fromKey} -> ${toKey}`;
    return payloadType;
  }

  // Orchestra error
  if (payloadType === "orchestra.error") {
    const message = typeof data.message === "string" ? data.message : "error";
    return `${payloadType}: ${message}`;
  }

  return payloadType;
}

/**
 * Correlate an array of events, enriching them with metadata.
 * Returns events sorted by timestamp ascending.
 */
export function correlateEvents(events: OpenCodeEventItem[]): CorrelatedEvent[] {
  const sorted = [...events].sort((a, b) => a.at - b.at);

  return sorted.map((event) => {
    const payload = event.payload;
    const type = asRecord(payload) && typeof payload.type === "string" ? payload.type : event.type;

    return {
      event,
      family: getEventFamily(type),
      correlationIds: extractCorrelationIds(event),
      description: describeEvent(event),
    };
  });
}
