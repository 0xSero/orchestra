import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { WorkerJobRegistry } from "../../../src/core/jobs";
import {
  onOrchestratorEvent,
  wireJobEventsToOrchestrator,
  type OrchestratorEvent,
  type OrchestratorEventType,
  type OrchestratorEventDataMap,
} from "../../../src/core/orchestrator-events";

type JobCreatedData = OrchestratorEventDataMap["orchestra.job.created"];
type JobProgressData = OrchestratorEventDataMap["orchestra.job.progress"];
type JobCompletedData = OrchestratorEventDataMap["orchestra.job.completed"];
type JobFailedData = OrchestratorEventDataMap["orchestra.job.failed"];
type JobCanceledData = OrchestratorEventDataMap["orchestra.job.canceled"];

describe("job lifecycle events", () => {
  let registry: WorkerJobRegistry;
  let events: OrchestratorEvent[];
  let unsubscribeEvents: () => void;
  let unsubscribeJobs: () => void;

  beforeEach(() => {
    registry = new WorkerJobRegistry();
    events = [];
    unsubscribeEvents = onOrchestratorEvent((event) => {
      events.push(event);
    });
    unsubscribeJobs = wireJobEventsToOrchestrator(registry);
  });

  afterEach(() => {
    unsubscribeEvents();
    unsubscribeJobs();
  });

  describe("orchestra.job.created", () => {
    test("emits job.created when job is created", () => {
      const job = registry.create({
        workerId: "test-worker",
        message: "Test task",
        sessionId: "session-1",
        requestedBy: "orchestrator",
      });

      const createdEvents = events.filter(
        (e) => e.type === "orchestra.job.created",
      );
      expect(createdEvents.length).toBe(1);

      const event = createdEvents[0];
      const data = event.data as JobCreatedData;
      expect(event.version).toBe(1);
      expect(data.jobId).toBe(job.id);
      expect(data.workerId).toBe("test-worker");
      expect(data.message).toBe("Test task");
      expect(data.sessionId).toBe("session-1");
      expect(data.requestedBy).toBe("orchestrator");
      expect(typeof data.startedAt).toBe("number");
    });

    test("job.created has correct envelope structure", () => {
      registry.create({
        workerId: "worker-1",
        message: "Task",
        sessionId: "s1",
        requestedBy: "test",
      });

      const event = events.find((e) => e.type === "orchestra.job.created")!;
      expect(typeof event.id).toBe("string");
      expect(typeof event.timestamp).toBe("number");
      expect(event.version).toBe(1);
    });
  });

  describe("orchestra.job.progress", () => {
    test("emits job.progress when progress is updated", () => {
      const job = registry.create({
        workerId: "test-worker",
        message: "Test task",
        sessionId: "session-1",
        requestedBy: "test",
      });

      events = []; // Clear creation event
      registry.updateProgress(job.id, {
        message: "Step 1 of 3",
        percent: 33,
      });

      const progressEvents = events.filter(
        (e) => e.type === "orchestra.job.progress",
      );
      expect(progressEvents.length).toBe(1);

      const event = progressEvents[0];
      const data = event.data as JobProgressData;
      expect(data.jobId).toBe(job.id);
      expect(data.workerId).toBe("test-worker");
      expect(data.message).toBe("Step 1 of 3");
      expect(data.percent).toBe(33);
      expect(typeof data.updatedAt).toBe("number");
    });
  });

  describe("orchestra.job.completed", () => {
    test("emits job.completed when job succeeds", () => {
      const job = registry.create({
        workerId: "test-worker",
        message: "Test task",
        sessionId: "session-1",
        requestedBy: "test",
      });

      events = [];
      registry.setResult(job.id, {
        responseText: "Task completed successfully",
      });

      const completedEvents = events.filter(
        (e) => e.type === "orchestra.job.completed",
      );
      expect(completedEvents.length).toBe(1);

      const event = completedEvents[0];
      const data = event.data as JobCompletedData;
      expect(data.jobId).toBe(job.id);
      expect(data.workerId).toBe("test-worker");
      expect(data.message).toBe("Test task");
      expect(typeof data.startedAt).toBe("number");
      expect(typeof data.finishedAt).toBe("number");
      expect(typeof data.durationMs).toBe("number");
      expect(data.responsePreview).toBe("Task completed successfully");
      expect(data.responseLength).toBe(27);
    });

    test("job.completed truncates long responses", () => {
      const job = registry.create({
        workerId: "test-worker",
        message: "Test task",
        sessionId: "session-1",
        requestedBy: "test",
      });

      const longResponse = "x".repeat(500);
      events = [];
      registry.setResult(job.id, { responseText: longResponse });

      const event = events.find((e) => e.type === "orchestra.job.completed")!;
      const data = event.data as JobCompletedData;
      expect(data.responsePreview?.length).toBe(200);
      expect(data.responseLength).toBe(500);
    });
  });

  describe("orchestra.job.failed", () => {
    test("emits job.failed when job fails", () => {
      const job = registry.create({
        workerId: "test-worker",
        message: "Test task",
        sessionId: "session-1",
        requestedBy: "test",
      });

      events = [];
      registry.setError(job.id, { error: "Something went wrong" });

      const failedEvents = events.filter(
        (e) => e.type === "orchestra.job.failed",
      );
      expect(failedEvents.length).toBe(1);

      const event = failedEvents[0];
      const data = event.data as JobFailedData;
      expect(data.jobId).toBe(job.id);
      expect(data.workerId).toBe("test-worker");
      expect(data.message).toBe("Test task");
      expect(data.error).toBe("Something went wrong");
      expect(typeof data.startedAt).toBe("number");
      expect(typeof data.finishedAt).toBe("number");
      expect(typeof data.durationMs).toBe("number");
    });
  });

  describe("orchestra.job.canceled", () => {
    test("emits job.canceled when job is canceled", () => {
      const job = registry.create({
        workerId: "test-worker",
        message: "Test task",
        sessionId: "session-1",
        requestedBy: "test",
      });

      events = [];
      registry.cancel(job.id, { reason: "User requested cancellation" });

      const canceledEvents = events.filter(
        (e) => e.type === "orchestra.job.canceled",
      );
      expect(canceledEvents.length).toBe(1);

      const event = canceledEvents[0];
      const data = event.data as JobCanceledData;
      expect(data.jobId).toBe(job.id);
      expect(data.workerId).toBe("test-worker");
      expect(data.message).toBe("Test task");
      expect(data.reason).toBe("User requested cancellation");
      expect(typeof data.startedAt).toBe("number");
      expect(typeof data.finishedAt).toBe("number");
      expect(typeof data.durationMs).toBe("number");
    });

    test("job.canceled without reason", () => {
      const job = registry.create({
        workerId: "test-worker",
        message: "Test task",
        sessionId: "session-1",
        requestedBy: "test",
      });

      events = [];
      registry.cancel(job.id);

      const event = events.find((e) => e.type === "orchestra.job.canceled")!;
      const data = event.data as JobCanceledData;
      expect(data.reason).toBeUndefined();
    });
  });

  describe("unsubscribe", () => {
    test("unsubscribing stops event emission", () => {
      unsubscribeJobs();

      registry.create({
        workerId: "test-worker",
        message: "Test task",
        sessionId: "session-1",
        requestedBy: "test",
      });

      const jobEvents = events.filter((e) =>
        e.type.startsWith("orchestra.job."),
      );
      expect(jobEvents.length).toBe(0);
    });
  });

  describe("event type enumeration", () => {
    test("all job event types are valid OrchestratorEventType", () => {
      const jobEventTypes: OrchestratorEventType[] = [
        "orchestra.job.created",
        "orchestra.job.progress",
        "orchestra.job.completed",
        "orchestra.job.failed",
        "orchestra.job.canceled",
      ];

      for (const type of jobEventTypes) {
        expect(type.startsWith("orchestra.job.")).toBe(true);
      }
    });
  });
});
