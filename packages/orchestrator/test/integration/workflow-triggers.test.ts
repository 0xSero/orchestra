import { beforeAll, describe, expect, test } from "bun:test";
import { createOrchestratorContext } from "../../src/context/orchestrator-context";
import { builtInProfiles } from "../../src/config/profiles";
import type { OrchestratorConfig } from "../../src/types";
import { registerWorkflow } from "../../src/workflows/engine";
import { buildVisionWorkflow } from "../../src/workflows/builtins/vision";
import { buildMemoryWorkflow } from "../../src/workflows/builtins/memory";
import {
  createWorkflowTriggers,
  updateSelfImproveActivity,
} from "../../src/workflows/triggers";
import { createTaskTools } from "../../src/command/tasks";
import { workerJobs } from "../../src/core/jobs";

const baseConfig: OrchestratorConfig = {
  basePort: 14096,
  autoSpawn: false,
  startupTimeout: 30000,
  healthCheckInterval: 30000,
  profiles: builtInProfiles,
  spawn: [],
  workflows: {
    enabled: true,
    triggers: {
      visionOnImage: {
        enabled: true,
        workflowId: "vision",
        autoSpawn: false,
        blocking: true,
      },
      memoryOnTurnEnd: {
        enabled: true,
        workflowId: "memory",
        autoSpawn: false,
        blocking: true,
      },
    },
  },
  memory: {
    enabled: true,
    autoRecord: true,
    autoSpawn: false,
    autoInject: false,
    scope: "project",
  },
};

beforeAll(() => {
  registerWorkflow(buildVisionWorkflow());
  registerWorkflow(buildMemoryWorkflow());
  registerWorkflow({
    id: "infinite-orchestra-test",
    name: "Infinite Orchestra Test",
    description: "Test workflow for infinite orchestra scheduling.",
    steps: [
      {
        id: "test",
        title: "Test",
        workerId: "coder",
        prompt: "Test",
        carry: false,
      },
    ],
  });
});

describe("workflow triggers", () => {
  test("vision trigger injects analysis and schedules workflow", async () => {
    let captured: any = null;
    const context = createOrchestratorContext({
      directory: "/tmp",
      projectId: "project-1",
      config: baseConfig,
    });

    const triggers = createWorkflowTriggers(context, {
      visionTimeoutMs: 1000,
      runWorkflow: async (input) => {
        captured = input;
        return {
          runId: "run-vision-1",
          workflowId: input.workflowId,
          workflowName: "Vision Analysis",
          status: "success",
          startedAt: 0,
          finishedAt: 1,
          currentStepIndex: 1,
          steps: [
            {
              id: "analyze",
              title: "Analyze Image",
              workerId: "vision",
              status: "success",
              response: "Image shows a login error dialog.",
              startedAt: 0,
              finishedAt: 1,
              durationMs: 1,
            },
          ],
        };
      },
      showToast: async () => {},
    });

    const input = {
      messageID: "m1",
      sessionID: "s1",
      agent: "orchestrator",
      role: "user",
    };
    const output = {
      parts: [
        { type: "text", text: "Please analyze this screenshot." },
        { type: "image", base64: "ZmFrZQ==", mime: "image/png" },
      ],
    };

    await triggers.handleVisionMessage(input, output);

    expect(captured?.workflowId).toBe("vision");
    expect(Array.isArray(captured?.attachments)).toBe(true);
    const combined = output.parts
      .map((p: any) => (p?.type === "text" ? p.text : ""))
      .join("\n");
    expect(combined.includes("[VISION ANALYSIS PENDING]")).toBe(true);
    expect(combined.includes("task_await")).toBe(true);
  });

  test("memory trigger emits payload and accepts done ack", async () => {
    let taskText = "";
    const context = createOrchestratorContext({
      directory: "/tmp",
      projectId: "project-1",
      config: baseConfig,
    });

    const triggers = createWorkflowTriggers(context, {
      visionTimeoutMs: 1000,
      runWorkflow: async (input) => {
        taskText = input.task;
        return {
          runId: "run-memory-1",
          workflowId: input.workflowId,
          workflowName: "Memory Capture",
          status: "success",
          startedAt: 0,
          finishedAt: 1,
          currentStepIndex: 1,
          steps: [
            {
              id: "record",
              title: "Record Memory",
              workerId: "memory",
              status: "success",
              response: "Stored 1 decision and 1 todo.",
              startedAt: 0,
              finishedAt: 1,
              durationMs: 1,
            },
          ],
        };
      },
      showToast: async () => {},
    });

    const input = {
      messageID: "m2",
      sessionID: "s1",
      agent: "orchestrator",
      role: "assistant",
      message: "Decision: use Neo4j.\nTodos:\n- add tests",
    };

    await triggers.handleMemoryTurnEnd(input, {});

    const payload = JSON.parse(taskText);
    expect(payload.type).toBe("memory.task");
    expect(payload.turn.decisions.length).toBe(1);
    expect(payload.turn.todos.length).toBe(1);

    const tools = createTaskTools(context);
    const started = await tools.taskStart.execute(
      {
        kind: "op",
        op: "memory.done",
        task: "memory.done",
        memory: { taskId: payload.taskId },
      } as any,
      { agent: "orchestrator", sessionID: "s1" } as any,
    );
    const opJob = JSON.parse(String(started));
    await tools.taskAwait.execute(
      { taskId: opJob.taskId, timeoutMs: 5000 } as any,
      { agent: "orchestrator", sessionID: "s1" } as any,
    );

    const job = workerJobs.get(payload.taskId);
    expect(job?.status).toBe("succeeded");
  });

  test("infinite orchestra trigger schedules without session idle events", async () => {
    updateSelfImproveActivity();

    let resolveCalled: (() => void) | undefined;
    const called = new Promise<void>((resolve) => {
      resolveCalled = resolve;
    });
    let receivedSessionId: string | undefined;

    const context = createOrchestratorContext({
      directory: "/tmp",
      projectId: "project-1",
      client: {
        session: {
          create: async () => ({ data: { id: "session-auto-1" } }),
        },
      } as any,
      config: {
        ...baseConfig,
        workflows: {
          enabled: true,
          triggers: {
            infiniteOrchestra: {
              enabled: true,
              workflowId: "infinite-orchestra-test",
              autoSpawn: false,
              blocking: true,
              idleMinutes: 0.001,
              cooldownMinutes: 60,
            },
          },
        },
      },
    });

    const triggers = createWorkflowTriggers(context, {
      visionTimeoutMs: 1000,
      runWorkflow: async (input, options) => {
        receivedSessionId = options?.sessionId;
        resolveCalled?.();
        return {
          runId: "run-infinite-1",
          workflowId: input.workflowId,
          workflowName: "Infinite Orchestra Test",
          status: "success",
          startedAt: 0,
          finishedAt: 1,
          currentStepIndex: 1,
          steps: [
            {
              id: "test",
              title: "Test",
              workerId: "coder",
              status: "success",
              response: "ok",
              startedAt: 0,
              finishedAt: 1,
              durationMs: 1,
            },
          ],
        };
      },
      showToast: async () => {},
    });

    await Promise.race([
      called,
      new Promise<void>((_, reject) =>
        setTimeout(() => reject(new Error("timeout")), 1000),
      ),
    ]);

    expect(receivedSessionId).toBe("session-auto-1");
    triggers.shutdown();
  });
});
