/**
 * Event Correlation Tests - Grouping and filtering events for observability
 */

import { describe, expect, test } from "vitest";
import {
  correlateEvents,
  filterEventsByFamily,
  groupEventsByCorrelationId,
  describeEvent,
  extractCorrelationIds,
  getEventFamily,
} from "../event-correlation";
import type { OpenCodeEventItem } from "@/context/opencode-types";

const createEvent = (
  type: string,
  payload: unknown,
  at: number = Date.now(),
  id: string = `evt-${Math.random().toString(36).slice(2)}`,
): OpenCodeEventItem => ({ id, type, payload, at });

describe("getEventFamily", () => {
  test("identifies session events", () => {
    expect(getEventFamily("session.created")).toBe("session");
    expect(getEventFamily("session.updated")).toBe("session");
    expect(getEventFamily("session.deleted")).toBe("session");
  });

  test("identifies message events", () => {
    expect(getEventFamily("message.created")).toBe("message");
    expect(getEventFamily("message.updated")).toBe("message");
    expect(getEventFamily("message.part.updated")).toBe("message");
  });

  test("identifies orchestra events", () => {
    expect(getEventFamily("orchestra.worker.status")).toBe("orchestra");
    expect(getEventFamily("orchestra.workflow.started")).toBe("orchestra");
    expect(getEventFamily("orchestra.job.created")).toBe("orchestra");
    expect(getEventFamily("orchestra.memory.written")).toBe("orchestra");
  });

  test("returns unknown for unrecognized events", () => {
    expect(getEventFamily("custom.event")).toBe("unknown");
    expect(getEventFamily("")).toBe("unknown");
  });
});

describe("extractCorrelationIds", () => {
  test("extracts sessionId from session events", () => {
    const event = createEvent("session.created", {
      type: "session.created",
      properties: { id: "session-123" },
    });
    const ids = extractCorrelationIds(event);
    expect(ids.sessionId).toBe("session-123");
  });

  test("extracts sessionId from message events", () => {
    const event = createEvent("message.updated", {
      type: "message.updated",
      properties: { sessionId: "session-456", info: { role: "user" } },
    });
    const ids = extractCorrelationIds(event);
    expect(ids.sessionId).toBe("session-456");
  });

  test("extracts workerId from worker status events", () => {
    const event = createEvent("orchestra.worker.status", {
      type: "orchestra.worker.status",
      data: { worker: { id: "coder" }, status: "ready" },
    });
    const ids = extractCorrelationIds(event);
    expect(ids.workerId).toBe("coder");
  });

  test("extracts workerId from worker stream events", () => {
    const event = createEvent("orchestra.worker.stream", {
      type: "orchestra.worker.stream",
      data: { chunk: { workerId: "vision" } },
    });
    const ids = extractCorrelationIds(event);
    expect(ids.workerId).toBe("vision");
  });

  test("extracts workflowId and runId from workflow events", () => {
    const event = createEvent("orchestra.workflow.started", {
      type: "orchestra.workflow.started",
      data: { workflowId: "deploy-pipeline", runId: "run-001" },
    });
    const ids = extractCorrelationIds(event);
    expect(ids.workflowId).toBe("deploy-pipeline");
    expect(ids.runId).toBe("run-001");
  });

  test("extracts stepId from workflow step events", () => {
    const event = createEvent("orchestra.workflow.step", {
      type: "orchestra.workflow.step",
      data: { workflowId: "test-flow", runId: "run-002", stepId: "step-1" },
    });
    const ids = extractCorrelationIds(event);
    expect(ids.stepId).toBe("step-1");
  });

  test("extracts jobId and taskId from job events", () => {
    const event = createEvent("orchestra.job.created", {
      type: "orchestra.job.created",
      data: { jobId: "job-123", taskId: "task-456", workerId: "coder" },
    });
    const ids = extractCorrelationIds(event);
    expect(ids.jobId).toBe("job-123");
    expect(ids.taskId).toBe("task-456");
    expect(ids.workerId).toBe("coder");
  });

  test("handles malformed events gracefully", () => {
    const event = createEvent("orchestra.job.created", null);
    const ids = extractCorrelationIds(event);
    expect(ids).toEqual({});
  });

  test("handles events with invalid data types", () => {
    const event = createEvent("orchestra.worker.status", {
      type: "orchestra.worker.status",
      data: "not-an-object",
    });
    const ids = extractCorrelationIds(event);
    expect(ids).toEqual({});
  });
});

describe("filterEventsByFamily", () => {
  const events: OpenCodeEventItem[] = [
    createEvent("session.created", { type: "session.created" }, 1000, "e1"),
    createEvent("message.updated", { type: "message.updated" }, 2000, "e2"),
    createEvent("orchestra.worker.status", { type: "orchestra.worker.status" }, 3000, "e3"),
    createEvent("orchestra.job.created", { type: "orchestra.job.created" }, 4000, "e4"),
    createEvent("session.updated", { type: "session.updated" }, 5000, "e5"),
  ];

  test("filters by single family", () => {
    const filtered = filterEventsByFamily(events, ["session"]);
    expect(filtered).toHaveLength(2);
    expect(filtered.map((e) => e.id)).toEqual(["e1", "e5"]);
  });

  test("filters by multiple families", () => {
    const filtered = filterEventsByFamily(events, ["session", "message"]);
    expect(filtered).toHaveLength(3);
    expect(filtered.map((e) => e.id)).toEqual(["e1", "e2", "e5"]);
  });

  test("returns all events when no families specified", () => {
    const filtered = filterEventsByFamily(events, []);
    expect(filtered).toHaveLength(5);
  });

  test("handles orchestra family", () => {
    const filtered = filterEventsByFamily(events, ["orchestra"]);
    expect(filtered).toHaveLength(2);
    expect(filtered.map((e) => e.id)).toEqual(["e3", "e4"]);
  });
});

describe("groupEventsByCorrelationId", () => {
  test("groups events by sessionId", () => {
    const events: OpenCodeEventItem[] = [
      createEvent(
        "session.created",
        { type: "session.created", properties: { id: "sess-1" } },
        1000,
        "e1",
      ),
      createEvent(
        "message.updated",
        { type: "message.updated", properties: { sessionId: "sess-1" } },
        2000,
        "e2",
      ),
      createEvent(
        "session.created",
        { type: "session.created", properties: { id: "sess-2" } },
        3000,
        "e3",
      ),
    ];

    const groups = groupEventsByCorrelationId(events, "sessionId");
    expect(Object.keys(groups)).toHaveLength(2);
    expect(groups["sess-1"]).toHaveLength(2);
    expect(groups["sess-2"]).toHaveLength(1);
  });

  test("groups events by workerId", () => {
    const events: OpenCodeEventItem[] = [
      createEvent(
        "orchestra.worker.status",
        { type: "orchestra.worker.status", data: { worker: { id: "coder" }, status: "ready" } },
        1000,
        "e1",
      ),
      createEvent(
        "orchestra.job.created",
        { type: "orchestra.job.created", data: { workerId: "coder", jobId: "j1" } },
        2000,
        "e2",
      ),
      createEvent(
        "orchestra.worker.status",
        { type: "orchestra.worker.status", data: { worker: { id: "vision" }, status: "ready" } },
        3000,
        "e3",
      ),
    ];

    const groups = groupEventsByCorrelationId(events, "workerId");
    expect(Object.keys(groups)).toHaveLength(2);
    expect(groups["coder"]).toHaveLength(2);
    expect(groups["vision"]).toHaveLength(1);
  });

  test("groups events by runId", () => {
    const events: OpenCodeEventItem[] = [
      createEvent(
        "orchestra.workflow.started",
        { type: "orchestra.workflow.started", data: { runId: "run-1", workflowId: "wf-1" } },
        1000,
        "e1",
      ),
      createEvent(
        "orchestra.workflow.step",
        { type: "orchestra.workflow.step", data: { runId: "run-1", stepId: "s1" } },
        2000,
        "e2",
      ),
      createEvent(
        "orchestra.workflow.completed",
        { type: "orchestra.workflow.completed", data: { runId: "run-1" } },
        3000,
        "e3",
      ),
    ];

    const groups = groupEventsByCorrelationId(events, "runId");
    expect(Object.keys(groups)).toHaveLength(1);
    expect(groups["run-1"]).toHaveLength(3);
  });

  test("puts ungroupable events in __uncorrelated", () => {
    const events: OpenCodeEventItem[] = [
      createEvent("custom.event", { type: "custom.event" }, 1000, "e1"),
      createEvent(
        "orchestra.error",
        { type: "orchestra.error", data: { message: "error" } },
        2000,
        "e2",
      ),
    ];

    const groups = groupEventsByCorrelationId(events, "sessionId");
    expect(groups["__uncorrelated"]).toHaveLength(2);
  });

  test("maintains stable ordering within groups", () => {
    const events: OpenCodeEventItem[] = [
      createEvent(
        "orchestra.job.created",
        { type: "orchestra.job.created", data: { jobId: "j1" } },
        3000,
        "e3",
      ),
      createEvent(
        "orchestra.job.progress",
        { type: "orchestra.job.progress", data: { jobId: "j1" } },
        1000,
        "e1",
      ),
      createEvent(
        "orchestra.job.completed",
        { type: "orchestra.job.completed", data: { jobId: "j1" } },
        2000,
        "e2",
      ),
    ];

    const groups = groupEventsByCorrelationId(events, "jobId");
    // Should be sorted by timestamp within group
    expect(groups["j1"].map((e) => e.id)).toEqual(["e1", "e2", "e3"]);
  });
});

describe("describeEvent", () => {
  test("describes session created event", () => {
    const event = createEvent("session.created", {
      type: "session.created",
      properties: { id: "sess-1", info: { title: "My Session" } },
    });
    expect(describeEvent(event)).toBe("session.created: My Session");
  });

  test("describes message updated event", () => {
    const event = createEvent("message.updated", {
      type: "message.updated",
      properties: { info: { role: "assistant" } },
    });
    expect(describeEvent(event)).toBe("message.updated: assistant");
  });

  test("describes worker status event", () => {
    const event = createEvent("orchestra.worker.status", {
      type: "orchestra.worker.status",
      data: { worker: { id: "coder" }, status: "ready" },
    });
    expect(describeEvent(event)).toBe("orchestra.worker.status: coder ready");
  });

  test("describes workflow step event", () => {
    const event = createEvent("orchestra.workflow.step", {
      type: "orchestra.workflow.step",
      data: { workflowId: "deploy", stepId: "build" },
    });
    expect(describeEvent(event)).toBe("orchestra.workflow.step: deploy/build");
  });

  test("describes job created event", () => {
    const event = createEvent("orchestra.job.created", {
      type: "orchestra.job.created",
      data: { jobId: "job-123", workerId: "coder", message: "Fix the bug" },
    });
    expect(describeEvent(event)).toBe("orchestra.job.created: coder job-123");
  });

  test("describes memory written event", () => {
    const event = createEvent("orchestra.memory.written", {
      type: "orchestra.memory.written",
      data: { key: "decisions/arch-001" },
    });
    expect(describeEvent(event)).toBe("orchestra.memory.written: decisions/arch-001");
  });

  test("describes memory link event", () => {
    const event = createEvent("orchestra.memory.written", {
      type: "orchestra.memory.written",
      data: { fromKey: "a", toKey: "b" },
    });
    expect(describeEvent(event)).toBe("orchestra.memory.written: a -> b");
  });

  test("describes error event", () => {
    const event = createEvent("orchestra.error", {
      type: "orchestra.error",
      data: { message: "Connection failed" },
    });
    expect(describeEvent(event)).toBe("orchestra.error: Connection failed");
  });

  test("handles unknown event types", () => {
    const event = createEvent("custom.unknown", { type: "custom.unknown" });
    expect(describeEvent(event)).toBe("custom.unknown");
  });

  test("handles malformed payloads", () => {
    const event = createEvent("orchestra.worker.status", null);
    expect(describeEvent(event)).toBe("orchestra.worker.status");
  });
});

describe("correlateEvents", () => {
  test("returns correlated events with enriched metadata", () => {
    const events: OpenCodeEventItem[] = [
      createEvent(
        "session.created",
        { type: "session.created", properties: { id: "sess-1" } },
        1000,
        "e1",
      ),
      createEvent(
        "orchestra.worker.status",
        { type: "orchestra.worker.status", data: { worker: { id: "coder" }, status: "ready" } },
        2000,
        "e2",
      ),
    ];

    const correlated = correlateEvents(events);
    expect(correlated).toHaveLength(2);

    expect(correlated[0].family).toBe("session");
    expect(correlated[0].correlationIds.sessionId).toBe("sess-1");
    expect(correlated[0].description).toBe("session.created");

    expect(correlated[1].family).toBe("orchestra");
    expect(correlated[1].correlationIds.workerId).toBe("coder");
    expect(correlated[1].description).toBe("orchestra.worker.status: coder ready");
  });

  test("sorts events by timestamp ascending", () => {
    const events: OpenCodeEventItem[] = [
      createEvent("session.created", { type: "session.created" }, 3000, "e3"),
      createEvent("session.updated", { type: "session.updated" }, 1000, "e1"),
      createEvent("message.updated", { type: "message.updated" }, 2000, "e2"),
    ];

    const correlated = correlateEvents(events);
    expect(correlated.map((e) => e.event.id)).toEqual(["e1", "e2", "e3"]);
  });

  test("handles empty array", () => {
    expect(correlateEvents([])).toEqual([]);
  });
});
