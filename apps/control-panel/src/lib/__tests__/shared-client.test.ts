/**
 * Tests for shared client adapter
 *
 * Tests the OrchestraDataAdapter interface and createOrchestraAdapter function.
 */

import { describe, expect, test, vi, beforeEach } from "vitest";
import { createOrchestraAdapter, type OrchestraDataAdapter } from "../shared-client";
import type { OrchestratorBridgeClient, JobRecord } from "../orchestrator-bridge";

describe("createOrchestraAdapter", () => {
  // Create mock dependencies
  const mockSessionCommand = vi.fn();

  const createMockOpenCodeClient = () => ({
    session: {
      command: mockSessionCommand,
    },
  });

  const createMockOrchestratorClient = (
    statusResult: Awaited<ReturnType<OrchestratorBridgeClient["fetchStatus"]>> = null,
    outputResult: Awaited<ReturnType<OrchestratorBridgeClient["fetchOutput"]>> = null,
  ): OrchestratorBridgeClient => ({
    fetchStatus: vi.fn().mockResolvedValue(statusResult),
    fetchOutput: vi.fn().mockResolvedValue(outputResult),
    getEventsUrl: () => "http://localhost:4097/v1/events",
    getBaseUrl: () => "http://localhost:4097",
  });

  let adapter: OrchestraDataAdapter;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getStatus", () => {
    test("returns connected status when both connected", () => {
      const opencode = createMockOpenCodeClient();
      const orchestrator = createMockOrchestratorClient();
      adapter = createOrchestraAdapter({
        opencode: opencode as never,
        orchestrator,
        connected: () => true,
        version: () => "1.0.0",
      });

      const status = adapter.getStatus();
      expect(status.opencodeConnected).toBe(true);
      expect(status.orchestratorConnected).toBe(true);
      expect(status.connected).toBe(true);
      expect(status.version).toBe("1.0.0");
    });

    test("returns disconnected status when not connected", () => {
      const opencode = createMockOpenCodeClient();
      const orchestrator = createMockOrchestratorClient();
      adapter = createOrchestraAdapter({
        opencode: opencode as never,
        orchestrator,
        connected: () => false,
        version: () => null,
      });

      const status = adapter.getStatus();
      expect(status.opencodeConnected).toBe(false);
      expect(status.orchestratorConnected).toBe(false);
      expect(status.connected).toBe(false);
      expect(status.version).toBeUndefined();
    });
  });

  describe("getOrchestratorStatus", () => {
    test("returns null when orchestrator not available", async () => {
      const opencode = createMockOpenCodeClient();
      const orchestrator = createMockOrchestratorClient(null);
      adapter = createOrchestraAdapter({
        opencode: opencode as never,
        orchestrator,
        connected: () => true,
        version: () => "1.0.0",
      });

      const status = await adapter.getOrchestratorStatus();
      expect(status).toBeNull();
    });

    test("returns orchestrator status when available", async () => {
      const opencode = createMockOpenCodeClient();
      const mockStatus = {
        workers: [{ id: "w1", name: "worker-1", status: "idle" }],
        jobs: { total: 5, running: 1, succeeded: 3, failed: 1, canceled: 0 },
      };
      const orchestrator = createMockOrchestratorClient(mockStatus);
      adapter = createOrchestraAdapter({
        opencode: opencode as never,
        orchestrator,
        connected: () => true,
        version: () => "1.0.0",
      });

      const status = await adapter.getOrchestratorStatus();
      expect(status).toEqual(mockStatus);
    });
  });

  describe("getJobs", () => {
    test("returns empty array when no jobs", async () => {
      const opencode = createMockOpenCodeClient();
      const orchestrator = createMockOrchestratorClient(null, null);
      adapter = createOrchestraAdapter({
        opencode: opencode as never,
        orchestrator,
        connected: () => true,
        version: () => "1.0.0",
      });

      const jobs = await adapter.getJobs();
      expect(jobs).toEqual([]);
    });

    test("returns job records from output", async () => {
      const opencode = createMockOpenCodeClient();
      const mockJobs: JobRecord[] = [
        {
          id: "job-1",
          workerId: "w1",
          message: "Test job",
          status: "succeeded",
          startedAt: Date.now(),
        },
      ];
      const orchestrator = createMockOrchestratorClient(null, { jobs: mockJobs, logs: [] });
      adapter = createOrchestraAdapter({
        opencode: opencode as never,
        orchestrator,
        connected: () => true,
        version: () => "1.0.0",
      });

      const jobs = await adapter.getJobs();
      expect(jobs).toEqual(mockJobs);
    });
  });

  describe("getJob", () => {
    test("returns undefined when job not found", async () => {
      const opencode = createMockOpenCodeClient();
      const orchestrator = createMockOrchestratorClient(null, { jobs: [], logs: [] });
      adapter = createOrchestraAdapter({
        opencode: opencode as never,
        orchestrator,
        connected: () => true,
        version: () => "1.0.0",
      });

      const job = await adapter.getJob("nonexistent");
      expect(job).toBeUndefined();
    });

    test("returns specific job by ID", async () => {
      const opencode = createMockOpenCodeClient();
      const mockJobs: JobRecord[] = [
        { id: "job-1", workerId: "w1", message: "Job 1", status: "running", startedAt: 1000 },
        { id: "job-2", workerId: "w2", message: "Job 2", status: "succeeded", startedAt: 2000 },
      ];
      const orchestrator = createMockOrchestratorClient(null, { jobs: mockJobs, logs: [] });
      adapter = createOrchestraAdapter({
        opencode: opencode as never,
        orchestrator,
        connected: () => true,
        version: () => "1.0.0",
      });

      const job = await adapter.getJob("job-2");
      expect(job).toEqual(mockJobs[1]);
    });
  });

  describe("startTask", () => {
    test("calls session command with correct parameters", async () => {
      const opencode = createMockOpenCodeClient();
      mockSessionCommand.mockResolvedValue({
        data: {
          parts: [{ text: JSON.stringify({ taskId: "task-123" }) }],
        },
      });
      const orchestrator = createMockOrchestratorClient();
      adapter = createOrchestraAdapter({
        opencode: opencode as never,
        orchestrator,
        connected: () => true,
        version: () => "1.0.0",
      });

      const result = await adapter.startTask({
        sessionId: "session-1",
        kind: "workflow",
        task: "Run deployment",
      });

      expect(mockSessionCommand).toHaveBeenCalledWith({
        path: { id: "session-1" },
        body: {
          command: "task_start",
          arguments: '--kind workflow --task "Run deployment"',
        },
      });
      expect(result.taskId).toBe("task-123");
    });

    test("throws when task ID not in response", async () => {
      const opencode = createMockOpenCodeClient();
      mockSessionCommand.mockResolvedValue({
        data: { parts: [] },
      });
      const orchestrator = createMockOrchestratorClient();
      adapter = createOrchestraAdapter({
        opencode: opencode as never,
        orchestrator,
        connected: () => true,
        version: () => "1.0.0",
      });

      await expect(
        adapter.startTask({
          sessionId: "session-1",
          kind: "auto",
          task: "Test task",
        }),
      ).rejects.toThrow("Failed to get task ID from response");
    });
  });

  describe("cancelTask", () => {
    test("calls session command with correct parameters", async () => {
      const opencode = createMockOpenCodeClient();
      mockSessionCommand.mockResolvedValue({ data: {} });
      const orchestrator = createMockOrchestratorClient();
      adapter = createOrchestraAdapter({
        opencode: opencode as never,
        orchestrator,
        connected: () => true,
        version: () => "1.0.0",
      });

      const result = await adapter.cancelTask("session-1", "task-123");

      expect(mockSessionCommand).toHaveBeenCalledWith({
        path: { id: "session-1" },
        body: {
          command: "task_cancel",
          arguments: "--taskId task-123",
        },
      });
      expect(result).toBe(true);
    });

    test("includes reason when provided", async () => {
      const opencode = createMockOpenCodeClient();
      mockSessionCommand.mockResolvedValue({ data: {} });
      const orchestrator = createMockOrchestratorClient();
      adapter = createOrchestraAdapter({
        opencode: opencode as never,
        orchestrator,
        connected: () => true,
        version: () => "1.0.0",
      });

      await adapter.cancelTask("session-1", "task-123", "User requested");

      expect(mockSessionCommand).toHaveBeenCalledWith({
        path: { id: "session-1" },
        body: {
          command: "task_cancel",
          arguments: '--taskId task-123 --reason "User requested"',
        },
      });
    });

    test("returns false on error", async () => {
      const opencode = createMockOpenCodeClient();
      mockSessionCommand.mockRejectedValue(new Error("Network error"));
      const orchestrator = createMockOrchestratorClient();
      adapter = createOrchestraAdapter({
        opencode: opencode as never,
        orchestrator,
        connected: () => true,
        version: () => "1.0.0",
      });

      const result = await adapter.cancelTask("session-1", "task-123");
      expect(result).toBe(false);
    });
  });
});
