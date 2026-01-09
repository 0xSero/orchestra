import { describe, expect, test } from "bun:test";
import {
  createOrchestratorEvent,
  onOrchestratorEvent,
  publishOrchestratorEvent,
  publishWorkerStatusEvent,
  publishErrorEvent,
  serializeWorkerInstance,
  ORCHESTRATOR_EVENT_VERSION,
  wireJobEventsToOrchestrator,
  type OrchestratorEvent,
  type OrchestratorEventType,
  type OrchestratorEventDataMap,
} from "../../src/core/orchestrator-events";
import type { WorkerInstance } from "../../src/types";

describe("orchestrator events", () => {
  describe("event envelope contract", () => {
    test("creates a versioned event envelope with required fields", () => {
      const event = createOrchestratorEvent("orchestra.error", {
        message: "boom",
      });
      expect(event.version).toBe(ORCHESTRATOR_EVENT_VERSION);
      expect(event.version).toBe(1);
      expect(event.type).toBe("orchestra.error");
      expect(typeof event.id).toBe("string");
      expect(event.id.length).toBeGreaterThan(0);
      expect(typeof event.timestamp).toBe("number");
      expect(event.timestamp).toBeGreaterThan(0);
      expect(event.data).toEqual({ message: "boom" });
    });

    test("envelope fields are stable JSON-serializable", () => {
      const event = createOrchestratorEvent("orchestra.error", {
        message: "test",
      });
      const json = JSON.stringify(event);
      const parsed = JSON.parse(json) as OrchestratorEvent;
      expect(parsed.version).toBe(event.version);
      expect(parsed.id).toBe(event.id);
      expect(parsed.type).toBe(event.type);
      expect(parsed.timestamp).toBe(event.timestamp);
      expect(parsed.data).toEqual(event.data);
    });

    test("allows custom id and timestamp via options", () => {
      const customId = "custom-event-id";
      const customTimestamp = 1704067200000;
      const event = createOrchestratorEvent(
        "orchestra.error",
        { message: "test" },
        { id: customId, timestamp: customTimestamp },
      );
      expect(event.id).toBe(customId);
      expect(event.timestamp).toBe(customTimestamp);
    });

    test("generates unique ids when not specified", () => {
      const event1 = createOrchestratorEvent("orchestra.error", {
        message: "test1",
      });
      const event2 = createOrchestratorEvent("orchestra.error", {
        message: "test2",
      });
      expect(event1.id).not.toBe(event2.id);
    });
  });

  describe("event types", () => {
    const allEventTypes: OrchestratorEventType[] = [
      "orchestra.worker.status",
      "orchestra.worker.stream",
      "orchestra.workflow.started",
      "orchestra.workflow.step",
      "orchestra.workflow.carry.trimmed",
      "orchestra.workflow.completed",
      "orchestra.memory.written",
      "orchestra.skill.load.started",
      "orchestra.skill.load.completed",
      "orchestra.skill.load.failed",
      "orchestra.skill.permission",
      "orchestra.job.created",
      "orchestra.job.progress",
      "orchestra.job.completed",
      "orchestra.job.failed",
      "orchestra.job.canceled",
      "orchestra.error",
    ];

    test("all known event types are valid", () => {
      for (const type of allEventTypes) {
        expect(type.startsWith("orchestra.")).toBe(true);
      }
    });
  });

  describe("publishOrchestratorEvent", () => {
    test("publishes events to subscribers", () => {
      let seen: OrchestratorEvent | undefined;
      const off = onOrchestratorEvent((event) => {
        seen = event;
      });
      const event = publishOrchestratorEvent("orchestra.error", {
        message: "boom",
      });
      off();
      expect(seen).toBeDefined();
      expect(seen?.type).toBe("orchestra.error");
      expect(seen?.id).toBe(event.id);
    });

    test("returns the created event", () => {
      const event = publishOrchestratorEvent("orchestra.error", {
        message: "test",
      });
      expect(event.version).toBe(1);
      expect(event.type).toBe("orchestra.error");
      expect(event.data.message).toBe("test");
    });

    test("unsubscribe stops receiving events", () => {
      let count = 0;
      const off = onOrchestratorEvent(() => {
        count++;
      });
      publishOrchestratorEvent("orchestra.error", { message: "1" });
      expect(count).toBe(1);
      off();
      publishOrchestratorEvent("orchestra.error", { message: "2" });
      expect(count).toBe(1);
    });
  });

  describe("publishWorkerStatusEvent", () => {
    test("publishes worker status snapshots with required fields", () => {
      const instance: WorkerInstance = {
        profile: {
          id: "worker-test",
          name: "Worker Test",
          model: "model",
          purpose: "test",
          whenToUse: "test",
        },
        status: "ready",
        port: 0,
        startedAt: new Date(),
      };

      const event = publishWorkerStatusEvent({ instance });
      expect(event.type).toBe("orchestra.worker.status");
      expect(event.data.worker.id).toBe("worker-test");
      expect(event.data.worker.name).toBe("Worker Test");
      expect(event.data.worker.model).toBe("model");
      expect(event.data.status).toBe("ready");
    });

    test("includes previousStatus and reason when provided", () => {
      const instance: WorkerInstance = {
        profile: {
          id: "worker-test",
          name: "Worker Test",
          model: "model",
          purpose: "test",
          whenToUse: "test",
        },
        status: "busy",
        port: 1234,
        startedAt: new Date(),
      };

      const event = publishWorkerStatusEvent({
        instance,
        previousStatus: "ready",
        reason: "task started",
      });
      expect(event.data.previousStatus).toBe("ready");
      expect(event.data.reason).toBe("task started");
    });

    test("status override works", () => {
      const instance: WorkerInstance = {
        profile: {
          id: "worker-test",
          name: "Worker Test",
          model: "model",
          purpose: "test",
          whenToUse: "test",
        },
        status: "ready",
        port: 0,
        startedAt: new Date(),
      };

      const event = publishWorkerStatusEvent({
        instance,
        status: "stopped",
      });
      expect(event.data.worker.status).toBe("stopped");
      expect(event.data.status).toBe("stopped");
    });
  });

  describe("publishErrorEvent", () => {
    test("publishes error events with message", () => {
      const event = publishErrorEvent({ message: "Something went wrong" });
      expect(event.type).toBe("orchestra.error");
      expect(event.data.message).toBe("Something went wrong");
    });

    test("includes optional fields when provided", () => {
      const event = publishErrorEvent({
        message: "Workflow failed",
        source: "workflow-runner",
        details: "Step 3 timed out",
        workerId: "worker-1",
        workflowId: "workflow-1",
        runId: "run-123",
        stepId: "step-3",
      });
      expect(event.data.message).toBe("Workflow failed");
      expect(event.data.source).toBe("workflow-runner");
      expect(event.data.details).toBe("Step 3 timed out");
      expect(event.data.workerId).toBe("worker-1");
      expect(event.data.workflowId).toBe("workflow-1");
      expect(event.data.runId).toBe("run-123");
      expect(event.data.stepId).toBe("step-3");
    });
  });

  describe("serializeWorkerInstance", () => {
    test("serializes worker instance with all fields", () => {
      const now = new Date();
      const instance: WorkerInstance = {
        profile: {
          id: "worker-1",
          name: "Worker One",
          model: "gpt-4",
          purpose: "coding",
          whenToUse: "code tasks",
          supportsVision: true,
          supportsWeb: false,
        },
        status: "ready",
        port: 4100,
        pid: 12345,
        serverUrl: "http://localhost:4100",
        sessionId: "session-123",
        parentSessionId: "parent-session",
        startedAt: now,
        lastActivity: now,
        currentTask: "writing tests",
        modelResolution: "explicit",
      };

      const snapshot = serializeWorkerInstance(instance);
      expect(snapshot.id).toBe("worker-1");
      expect(snapshot.name).toBe("Worker One");
      expect(snapshot.model).toBe("gpt-4");
      expect(snapshot.status).toBe("ready");
      expect(snapshot.port).toBe(4100);
      expect(snapshot.pid).toBe(12345);
      expect(snapshot.serverUrl).toBe("http://localhost:4100");
      expect(snapshot.sessionId).toBe("session-123");
      expect(snapshot.parentSessionId).toBe("parent-session");
      expect(snapshot.supportsVision).toBe(true);
      expect(snapshot.supportsWeb).toBe(false);
      expect(snapshot.currentTask).toBe("writing tests");
      expect(snapshot.modelResolution).toBe("explicit");
      expect(snapshot.lastActivity).toBe(now.toISOString());
    });

    test("serializes lastResult when present", () => {
      const resultAt = new Date();
      const instance: WorkerInstance = {
        profile: {
          id: "worker-1",
          name: "Worker One",
          model: "gpt-4",
          purpose: "coding",
          whenToUse: "code tasks",
        },
        status: "ready",
        port: 4100,
        startedAt: new Date(),
        lastResult: {
          at: resultAt,
          jobId: "job-123",
          response: "Task completed",
          report: { summary: "All tests passed" },
          durationMs: 5000,
        },
      };

      const snapshot = serializeWorkerInstance(instance);
      expect(snapshot.lastResult).toBeDefined();
      expect(snapshot.lastResult?.at).toBe(resultAt.toISOString());
      expect(snapshot.lastResult?.jobId).toBe("job-123");
      expect(snapshot.lastResult?.response).toBe("Task completed");
      expect(snapshot.lastResult?.report?.summary).toBe("All tests passed");
      expect(snapshot.lastResult?.durationMs).toBe(5000);
    });

    test("status override in serialization works", () => {
      const instance: WorkerInstance = {
        profile: {
          id: "worker-1",
          name: "Worker One",
          model: "gpt-4",
          purpose: "coding",
          whenToUse: "code tasks",
        },
        status: "ready",
        port: 4100,
        startedAt: new Date(),
      };

      const snapshot = serializeWorkerInstance(instance, { status: "busy" });
      expect(snapshot.status).toBe("busy");
    });
  });

  describe("wireJobEventsToOrchestrator", () => {
    test("emits orchestra.job.created event when job is created", () => {
      const events: OrchestratorEvent[] = [];
      const off = onOrchestratorEvent((event) => events.push(event));
      const unsubscribe = wireJobEventsToOrchestrator({
        onJobEvent: (callback) => {
          callback(
            {
              id: "job-123",
              workerId: "coder",
              message: "Test job",
              startedAt: Date.now(),
            },
            "created",
          );
          return () => {};
        },
      });
      off();
      unsubscribe();

      expect(events).toHaveLength(1);
      expect(events[0].type).toBe("orchestra.job.created");
      const createdData = events[0]
        .data as OrchestratorEventDataMap["orchestra.job.created"];
      expect(createdData.jobId).toBe("job-123");
      expect(createdData.workerId).toBe("coder");
      expect(createdData.message).toBe("Test job");
    });

    test("emits orchestra.job.progress event with percent", () => {
      const events: OrchestratorEvent[] = [];
      const off = onOrchestratorEvent((event) => events.push(event));
      const unsubscribe = wireJobEventsToOrchestrator({
        onJobEvent: (callback) => {
          callback(
            {
              id: "job-456",
              workerId: "docs",
              message: "Processing",
              startedAt: Date.now(),
              progress: {
                message: "Step 2 of 4",
                percent: 50,
                updatedAt: Date.now(),
              },
            },
            "progress",
          );
          return () => {};
        },
      });
      off();
      unsubscribe();

      expect(events).toHaveLength(1);
      expect(events[0].type).toBe("orchestra.job.progress");
      const progressData = events[0]
        .data as OrchestratorEventDataMap["orchestra.job.progress"];
      expect(progressData.jobId).toBe("job-456");
      expect(progressData.percent).toBe(50);
    });

    test("emits orchestra.job.completed event with response preview", () => {
      const longResponse = "A".repeat(300);
      const events: OrchestratorEvent[] = [];
      const off = onOrchestratorEvent((event) => events.push(event));
      const unsubscribe = wireJobEventsToOrchestrator({
        onJobEvent: (callback) => {
          callback(
            {
              id: "job-789",
              workerId: "coder",
              message: "Implement feature",
              startedAt: Date.now() - 5000,
              finishedAt: Date.now(),
              durationMs: 5000,
              responseText: longResponse,
            },
            "completed",
          );
          return () => {};
        },
      });
      off();
      unsubscribe();

      expect(events).toHaveLength(1);
      expect(events[0].type).toBe("orchestra.job.completed");
      const completedData = events[0]
        .data as OrchestratorEventDataMap["orchestra.job.completed"];
      expect(completedData.jobId).toBe("job-789");
      expect(completedData.durationMs).toBe(5000);
      expect(completedData.responseLength).toBe(300);
      expect(completedData.responsePreview?.length).toBe(200);
    });

    test("emits orchestra.job.failed event with error", () => {
      const events: OrchestratorEvent[] = [];
      const off = onOrchestratorEvent((event) => events.push(event));
      const unsubscribe = wireJobEventsToOrchestrator({
        onJobEvent: (callback) => {
          callback(
            {
              id: "job-fail",
              workerId: "vision",
              message: "Analyze image",
              startedAt: Date.now() - 10000,
              finishedAt: Date.now(),
              durationMs: 10000,
              error: "Timeout",
            },
            "failed",
          );
          return () => {};
        },
      });
      off();
      unsubscribe();

      expect(events).toHaveLength(1);
      expect(events[0].type).toBe("orchestra.job.failed");
      const failedData = events[0]
        .data as OrchestratorEventDataMap["orchestra.job.failed"];
      expect(failedData.error).toBe("Timeout");
    });

    test("emits orchestra.job.canceled event with reason", () => {
      const events: OrchestratorEvent[] = [];
      const off = onOrchestratorEvent((event) => events.push(event));
      const unsubscribe = wireJobEventsToOrchestrator({
        onJobEvent: (callback) => {
          callback(
            {
              id: "job-cancel",
              workerId: "coder",
              message: "Long running task",
              startedAt: Date.now() - 3000,
              finishedAt: Date.now(),
              durationMs: 3000,
              error: "User requested",
            },
            "canceled",
          );
          return () => {};
        },
      });
      off();
      unsubscribe();

      expect(events).toHaveLength(1);
      expect(events[0].type).toBe("orchestra.job.canceled");
      const canceledData = events[0]
        .data as OrchestratorEventDataMap["orchestra.job.canceled"];
      expect(canceledData.reason).toBe("User requested");
    });

    test("does not emit progress event when job has no progress", () => {
      const events: OrchestratorEvent[] = [];
      const off = onOrchestratorEvent((event) => events.push(event));
      const unsubscribe = wireJobEventsToOrchestrator({
        onJobEvent: (callback) => {
          callback(
            {
              id: "job-noprogress",
              workerId: "coder",
              message: "Task",
              startedAt: Date.now(),
            },
            "progress",
          );
          return () => {};
        },
      });
      off();
      unsubscribe();

      expect(events).toHaveLength(0);
    });

    test("returns unsubscribe function that stops events", () => {
      const events: OrchestratorEvent[] = [];
      const off = onOrchestratorEvent((event) => events.push(event));
      const registry = {
        onJobEvent: (
          callback: (
            job: {
              id: string;
              workerId: string;
              message: string;
              startedAt: number;
            },
            event: "created" | "progress" | "completed" | "failed" | "canceled",
          ) => void,
        ) => {
          callback(
            { id: "job-1", workerId: "w", message: "m", startedAt: Date.now() },
            "created",
          );
          return () => {};
        },
      };
      const unsubscribe = wireJobEventsToOrchestrator(registry);
      unsubscribe();
      off();

      expect(events).toHaveLength(1);
      expect(events[0].type).toBe("orchestra.job.created");
    });

    test("includes sessionId when present in job", () => {
      const events: OrchestratorEvent[] = [];
      const off = onOrchestratorEvent((event) => events.push(event));
      const unsubscribe = wireJobEventsToOrchestrator({
        onJobEvent: (callback) => {
          callback(
            {
              id: "job-session",
              workerId: "coder",
              message: "Task",
              startedAt: Date.now(),
              sessionId: "session-abc",
              requestedBy: "user",
            },
            "created",
          );
          return () => {};
        },
      });
      off();
      unsubscribe();

      expect(events).toHaveLength(1);
      const createdData = events[0]
        .data as OrchestratorEventDataMap["orchestra.job.created"];
      expect(createdData.sessionId).toBe("session-abc");
      expect(createdData.requestedBy).toBe("user");
    });
  });
});
