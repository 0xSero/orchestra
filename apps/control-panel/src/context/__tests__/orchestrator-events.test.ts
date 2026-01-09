import { describe, expect, test } from "vitest";
import {
  parseOrchestratorEvent,
  extractWorkerSnapshotFromEvent,
  extractWorkerStreamChunkFromEvent,
  extractSkillLoadEventFromEvent,
  toWorkerRuntime,
  isWorkerStatus,
} from "../opencode-helpers";
import type { OrchestratorEvent, OrchestratorEventType } from "../opencode-types";

describe("orchestrator event parsing", () => {
  describe("parseOrchestratorEvent", () => {
    test("parses valid event envelope", () => {
      const payload = {
        version: 1,
        id: "event-123",
        type: "orchestra.worker.status",
        timestamp: 1704067200000,
        data: { worker: { id: "test" }, status: "ready" },
      };

      const event = parseOrchestratorEvent(payload);
      expect(event).not.toBeNull();
      expect(event?.version).toBe(1);
      expect(event?.id).toBe("event-123");
      expect(event?.type).toBe("orchestra.worker.status");
      expect(event?.timestamp).toBe(1704067200000);
      expect(event?.data).toEqual({ worker: { id: "test" }, status: "ready" });
    });

    test("returns null for non-object payload", () => {
      expect(parseOrchestratorEvent(null)).toBeNull();
      expect(parseOrchestratorEvent(undefined)).toBeNull();
      expect(parseOrchestratorEvent("string")).toBeNull();
      expect(parseOrchestratorEvent(123)).toBeNull();
      expect(parseOrchestratorEvent([])).toBeNull();
    });

    test("returns null for missing required fields", () => {
      // Missing type
      expect(
        parseOrchestratorEvent({
          version: 1,
          id: "event-123",
          timestamp: 1704067200000,
          data: {},
        }),
      ).toBeNull();

      // Missing id
      expect(
        parseOrchestratorEvent({
          version: 1,
          type: "orchestra.error",
          timestamp: 1704067200000,
          data: {},
        }),
      ).toBeNull();

      // Missing timestamp
      expect(
        parseOrchestratorEvent({
          version: 1,
          id: "event-123",
          type: "orchestra.error",
          data: {},
        }),
      ).toBeNull();

      // Missing version
      expect(
        parseOrchestratorEvent({
          id: "event-123",
          type: "orchestra.error",
          timestamp: 1704067200000,
          data: {},
        }),
      ).toBeNull();

      // Missing data
      expect(
        parseOrchestratorEvent({
          version: 1,
          id: "event-123",
          type: "orchestra.error",
          timestamp: 1704067200000,
        }),
      ).toBeNull();
    });

    test("returns null for wrong field types", () => {
      expect(
        parseOrchestratorEvent({
          version: "1", // should be number
          id: "event-123",
          type: "orchestra.error",
          timestamp: 1704067200000,
          data: {},
        }),
      ).toBeNull();

      expect(
        parseOrchestratorEvent({
          version: 1,
          id: 123, // should be string
          type: "orchestra.error",
          timestamp: 1704067200000,
          data: {},
        }),
      ).toBeNull();

      expect(
        parseOrchestratorEvent({
          version: 1,
          id: "event-123",
          type: 123, // should be string
          timestamp: 1704067200000,
          data: {},
        }),
      ).toBeNull();

      expect(
        parseOrchestratorEvent({
          version: 1,
          id: "event-123",
          type: "orchestra.error",
          timestamp: "1704067200000", // should be number
          data: {},
        }),
      ).toBeNull();

      expect(
        parseOrchestratorEvent({
          version: 1,
          id: "event-123",
          type: "orchestra.error",
          timestamp: 1704067200000,
          data: "string", // should be object
        }),
      ).toBeNull();
    });

    test("parses all known event types", () => {
      const eventTypes: OrchestratorEventType[] = [
        "orchestra.worker.status",
        "orchestra.worker.stream",
        "orchestra.workflow.started",
        "orchestra.workflow.step",
        "orchestra.workflow.completed",
        "orchestra.workflow.carry.trimmed",
        "orchestra.memory.written",
        "orchestra.skill.load.started",
        "orchestra.skill.load.completed",
        "orchestra.skill.load.failed",
        "orchestra.skill.permission",
        "orchestra.error",
      ];

      for (const type of eventTypes) {
        const event = parseOrchestratorEvent({
          version: 1,
          id: `event-${type}`,
          type,
          timestamp: 1704067200000,
          data: {},
        });
        expect(event).not.toBeNull();
        expect(event?.type).toBe(type);
      }
    });
  });

  describe("extractWorkerSnapshotFromEvent", () => {
    test("extracts worker from worker.status event", () => {
      const event: OrchestratorEvent = {
        version: 1,
        id: "event-123",
        type: "orchestra.worker.status",
        timestamp: 1704067200000,
        data: {
          worker: {
            id: "worker-1",
            name: "Worker One",
            status: "ready",
            model: "gpt-4",
          },
          status: "ready",
        },
      };

      const worker = extractWorkerSnapshotFromEvent(event);
      expect(worker).not.toBeNull();
      expect((worker as Record<string, unknown>).id).toBe("worker-1");
      expect((worker as Record<string, unknown>).name).toBe("Worker One");
    });

    test("returns null for non-worker events", () => {
      const event: OrchestratorEvent = {
        version: 1,
        id: "event-123",
        type: "orchestra.error",
        timestamp: 1704067200000,
        data: { message: "error" },
      };

      expect(extractWorkerSnapshotFromEvent(event)).toBeNull();
    });

    test("returns null when worker field is missing", () => {
      const event: OrchestratorEvent = {
        version: 1,
        id: "event-123",
        type: "orchestra.worker.status",
        timestamp: 1704067200000,
        data: { status: "ready" },
      };

      expect(extractWorkerSnapshotFromEvent(event)).toBeNull();
    });
  });

  describe("extractWorkerStreamChunkFromEvent", () => {
    test("extracts stream chunk from worker.stream event", () => {
      const event: OrchestratorEvent = {
        version: 1,
        id: "event-123",
        type: "orchestra.worker.stream",
        timestamp: 1704067200000,
        data: {
          chunk: {
            workerId: "worker-1",
            jobId: "job-123",
            chunk: "Hello world",
            timestamp: 1704067200000,
            final: false,
          },
        },
      };

      const chunk = extractWorkerStreamChunkFromEvent(event);
      expect(chunk).not.toBeNull();
      expect(chunk?.workerId).toBe("worker-1");
      expect(chunk?.jobId).toBe("job-123");
      expect(chunk?.chunk).toBe("Hello world");
      expect(chunk?.timestamp).toBe(1704067200000);
      expect(chunk?.final).toBe(false);
    });

    test("extracts final chunk", () => {
      const event: OrchestratorEvent = {
        version: 1,
        id: "event-123",
        type: "orchestra.worker.stream",
        timestamp: 1704067200000,
        data: {
          chunk: {
            workerId: "worker-1",
            chunk: "Done",
            timestamp: 1704067200000,
            final: true,
          },
        },
      };

      const chunk = extractWorkerStreamChunkFromEvent(event);
      expect(chunk?.final).toBe(true);
    });

    test("returns null for non-stream events", () => {
      const event: OrchestratorEvent = {
        version: 1,
        id: "event-123",
        type: "orchestra.worker.status",
        timestamp: 1704067200000,
        data: { worker: {}, status: "ready" },
      };

      expect(extractWorkerStreamChunkFromEvent(event)).toBeNull();
    });

    test("returns null for missing workerId", () => {
      const event: OrchestratorEvent = {
        version: 1,
        id: "event-123",
        type: "orchestra.worker.stream",
        timestamp: 1704067200000,
        data: {
          chunk: {
            chunk: "Hello",
            timestamp: 1704067200000,
          },
        },
      };

      expect(extractWorkerStreamChunkFromEvent(event)).toBeNull();
    });
  });

  describe("extractSkillLoadEventFromEvent", () => {
    test("extracts skill load started event", () => {
      const event: OrchestratorEvent = {
        version: 1,
        id: "event-123",
        type: "orchestra.skill.load.started",
        timestamp: 1704067200000,
        data: {
          skillName: "test-skill",
          sessionId: "session-123",
          callId: "call-456",
          worker: { id: "worker-1", kind: "server" },
          source: "in-process",
        },
      };

      const skillEvent = extractSkillLoadEventFromEvent(event);
      expect(skillEvent).not.toBeNull();
      expect(skillEvent?.id).toBe("event-123");
      expect(skillEvent?.type).toBe("orchestra.skill.load.started");
      expect(skillEvent?.skillName).toBe("test-skill");
      expect(skillEvent?.sessionId).toBe("session-123");
      expect(skillEvent?.callId).toBe("call-456");
      expect(skillEvent?.workerId).toBe("worker-1");
      expect(skillEvent?.workerKind).toBe("server");
      expect(skillEvent?.source).toBe("in-process");
      expect(skillEvent?.status).toBeUndefined();
    });

    test("extracts skill load completed event with success status", () => {
      const event: OrchestratorEvent = {
        version: 1,
        id: "event-123",
        type: "orchestra.skill.load.completed",
        timestamp: 1704067200000,
        data: {
          skillName: "test-skill",
          durationMs: 500,
          outputBytes: 1024,
          source: "server",
        },
      };

      const skillEvent = extractSkillLoadEventFromEvent(event);
      expect(skillEvent?.status).toBe("success");
      expect(skillEvent?.durationMs).toBe(500);
      expect(skillEvent?.outputBytes).toBe(1024);
      expect(skillEvent?.source).toBe("server");
    });

    test("extracts skill load failed event with error status", () => {
      const event: OrchestratorEvent = {
        version: 1,
        id: "event-123",
        type: "orchestra.skill.load.failed",
        timestamp: 1704067200000,
        data: {
          skillName: "test-skill",
          source: "in-process",
        },
      };

      const skillEvent = extractSkillLoadEventFromEvent(event);
      expect(skillEvent?.status).toBe("error");
    });

    test("returns null for non-skill events", () => {
      const event: OrchestratorEvent = {
        version: 1,
        id: "event-123",
        type: "orchestra.error",
        timestamp: 1704067200000,
        data: { message: "error" },
      };

      expect(extractSkillLoadEventFromEvent(event)).toBeNull();
    });
  });

  describe("toWorkerRuntime", () => {
    test("converts raw worker data to WorkerRuntime", () => {
      const raw = {
        profile: {
          id: "worker-1",
          name: "Worker One",
          model: "gpt-4",
          supportsVision: true,
          supportsWeb: false,
        },
        status: "ready",
        sessionId: "session-123",
        parentSessionId: "parent-session",
        port: 4100,
        serverUrl: "http://localhost:4100",
        lastActivity: "2024-01-01T00:00:00.000Z",
        currentTask: "test task",
      };

      const worker = toWorkerRuntime(raw);
      expect(worker).not.toBeNull();
      expect(worker?.id).toBe("worker-1");
      expect(worker?.name).toBe("Worker One");
      expect(worker?.model).toBe("gpt-4");
      expect(worker?.status).toBe("ready");
      expect(worker?.sessionId).toBe("session-123");
      expect(worker?.parentSessionId).toBe("parent-session");
      expect(worker?.port).toBe(4100);
      expect(worker?.serverUrl).toBe("http://localhost:4100");
      expect(worker?.supportsVision).toBe(true);
      expect(worker?.supportsWeb).toBe(false);
      expect(worker?.lastActivity).toBe("2024-01-01T00:00:00.000Z");
      expect(worker?.currentTask).toBe("test task");
    });

    test("uses id from profile first, then falls back to raw.id", () => {
      const withProfileId = toWorkerRuntime({
        profile: { id: "profile-id", name: "Test" },
        status: "ready",
      });
      expect(withProfileId?.id).toBe("profile-id");

      const withRawId = toWorkerRuntime({
        id: "raw-id",
        profile: {},
        status: "ready",
      });
      expect(withRawId?.id).toBe("raw-id");
    });

    test("returns null for missing id", () => {
      expect(toWorkerRuntime({ profile: {}, status: "ready" })).toBeNull();
      expect(toWorkerRuntime({ profile: { name: "Test" }, status: "ready" })).toBeNull();
    });

    test("returns null for non-object input", () => {
      expect(toWorkerRuntime(null)).toBeNull();
      expect(toWorkerRuntime(undefined)).toBeNull();
      expect(toWorkerRuntime("string")).toBeNull();
      expect(toWorkerRuntime([])).toBeNull();
    });

    test("defaults status to starting for unknown status", () => {
      const worker = toWorkerRuntime({
        profile: { id: "test" },
        status: "unknown-status",
      });
      expect(worker?.status).toBe("starting");
    });

    test("parses lastResult when present", () => {
      const raw = {
        profile: { id: "worker-1" },
        status: "ready",
        lastResult: {
          at: "2024-01-01T00:00:00.000Z",
          jobId: "job-123",
          response: "Task done",
          report: { summary: "Success" },
          durationMs: 1000,
        },
      };

      const worker = toWorkerRuntime(raw);
      expect(worker?.lastResult).toBeDefined();
      expect(worker?.lastResult?.at).toBe("2024-01-01T00:00:00.000Z");
      expect(worker?.lastResult?.jobId).toBe("job-123");
      expect(worker?.lastResult?.response).toBe("Task done");
      expect(worker?.lastResult?.report?.summary).toBe("Success");
      expect(worker?.lastResult?.durationMs).toBe(1000);
    });

    test("includes error and warning when present", () => {
      const worker = toWorkerRuntime({
        profile: { id: "worker-1" },
        status: "error",
        error: "Connection failed",
        warning: "High memory usage",
      });
      expect(worker?.error).toBe("Connection failed");
      expect(worker?.warning).toBe("High memory usage");
    });

    test("prefers uiSessionId over sessionId", () => {
      const worker = toWorkerRuntime({
        profile: { id: "worker-1" },
        status: "ready",
        uiSessionId: "ui-session",
        sessionId: "worker-session",
      });
      expect(worker?.sessionId).toBe("ui-session");
      expect(worker?.workerSessionId).toBe("worker-session");
    });
  });

  describe("isWorkerStatus", () => {
    test("returns true for valid worker statuses", () => {
      expect(isWorkerStatus("starting")).toBe(true);
      expect(isWorkerStatus("ready")).toBe(true);
      expect(isWorkerStatus("busy")).toBe(true);
      expect(isWorkerStatus("error")).toBe(true);
      expect(isWorkerStatus("stopped")).toBe(true);
    });

    test("returns false for invalid statuses", () => {
      expect(isWorkerStatus("unknown")).toBe(false);
      expect(isWorkerStatus("running")).toBe(false);
      expect(isWorkerStatus("")).toBe(false);
      expect(isWorkerStatus(null)).toBe(false);
      expect(isWorkerStatus(undefined)).toBe(false);
      expect(isWorkerStatus(123)).toBe(false);
    });
  });
});
