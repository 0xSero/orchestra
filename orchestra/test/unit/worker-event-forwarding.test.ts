import { describe, expect, test } from "bun:test";
import type { WorkerInstance } from "../../src/types";
import type { WorkerSessionManager } from "../../src/workers";
import { startEventForwarding } from "../../src/workers/event-forwarding";

describe("worker event forwarding", () => {
  test("records tool, message, error, progress, and completion events", async () => {
    const activities: Array<{ type: string }> = [];
    const statusUpdates: Array<{ status: string; error?: string }> = [];
    const sessionManager = {
      recordActivity: (_id: string, activity: { type: string }) => {
        activities.push(activity);
      },
      updateStatus: (_id: string, status: string, error?: string) => {
        statusUpdates.push({ status, error });
      },
    } as unknown as WorkerSessionManager;

    const message = {
      info: { id: "msg-1", role: "assistant" },
      parts: [
        { type: "tool-invocation", toolInvocation: { toolName: "search", args: { q: "hi" }, state: "completed" } },
        { type: "text", text: "Hello there" },
        { type: "error", error: "oops" },
        { type: "reasoning", reasoning: { content: "thinking" } },
      ],
    };

    const instance: WorkerInstance = {
      profile: { id: "alpha", name: "Alpha", model: "model-a", purpose: "", whenToUse: "" },
      status: "ready",
      port: 0,
      directory: process.cwd(),
      sessionId: "session-1",
      startedAt: new Date(),
      toolCount: 0,
      messageCount: 0,
      client: {
        session: {
          messages: async () => ({ data: [message] }),
        },
      } as never,
    };

    const handle = startEventForwarding(instance, sessionManager, {} as never, { pollIntervalMs: 0 });
    await new Promise((resolve) => setTimeout(resolve, 10));
    handle.stop();

    expect(activities.some((a) => a.type === "tool")).toBe(true);
    expect(activities.some((a) => a.type === "message")).toBe(true);
    expect(activities.some((a) => a.type === "error")).toBe(true);
    expect(activities.some((a) => a.type === "progress")).toBe(true);
    expect(activities.some((a) => a.type === "complete")).toBe(true);
    expect(statusUpdates.some((s) => s.status === "error")).toBe(true);
    expect(instance.toolCount).toBe(1);
  });

  test("captures polling errors and updates session status", async () => {
    const statusUpdates: Array<{ status: string; error?: string }> = [];
    const sessionManager = {
      recordActivity: () => {},
      updateStatus: (_id: string, status: string, error?: string) => {
        statusUpdates.push({ status, error });
      },
    } as unknown as WorkerSessionManager;

    const instance: WorkerInstance = {
      profile: { id: "alpha", name: "Alpha", model: "model-a", purpose: "", whenToUse: "" },
      status: "ready",
      port: 0,
      directory: process.cwd(),
      sessionId: "session-1",
      startedAt: new Date(),
      toolCount: 0,
      messageCount: 0,
      client: {
        session: {
          messages: async () => {
            throw new Error("poll failed");
          },
        },
      } as never,
    };

    const handle = startEventForwarding(instance, sessionManager, {} as never, { pollIntervalMs: 0 });
    await new Promise((resolve) => setTimeout(resolve, 10));
    handle.stop();

    expect(statusUpdates.some((s) => s.status === "error")).toBe(true);
  });

  test("schedules next poll when no messages are returned", async () => {
    const sessionManager = {
      recordActivity: () => {},
      updateStatus: () => {},
    } as unknown as WorkerSessionManager;

    const instance: WorkerInstance = {
      profile: { id: "alpha", name: "Alpha", model: "model-a", purpose: "", whenToUse: "" },
      status: "ready",
      port: 0,
      directory: process.cwd(),
      sessionId: "session-empty",
      startedAt: new Date(),
      toolCount: 0,
      messageCount: 0,
      client: {
        session: {
          messages: async () => ({ data: [] }),
        },
      } as never,
    };

    const handle = startEventForwarding(instance, sessionManager, {} as never, { pollIntervalMs: 5 });
    await new Promise((resolve) => setTimeout(resolve, 15));
    handle.stop();
  });

  test("stops polling on terminal errors", async () => {
    const sessionManager = {
      recordActivity: () => {},
      updateStatus: () => {},
    } as unknown as WorkerSessionManager;

    const instance: WorkerInstance = {
      profile: { id: "alpha", name: "Alpha", model: "model-a", purpose: "", whenToUse: "" },
      status: "ready",
      port: 0,
      directory: process.cwd(),
      sessionId: "session-terminal",
      startedAt: new Date(),
      toolCount: 0,
      messageCount: 0,
      client: {
        session: {
          messages: async () => {
            throw new Error("session not found");
          },
        },
      } as never,
    };

    const handle = startEventForwarding(instance, sessionManager, {} as never, { pollIntervalMs: 0 });
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(handle.isActive()).toBe(false);
  });

  test("stops after repeated non-terminal errors", async () => {
    const sessionManager = {
      recordActivity: () => {},
      updateStatus: () => {},
    } as unknown as WorkerSessionManager;

    const instance: WorkerInstance = {
      profile: { id: "alpha", name: "Alpha", model: "model-a", purpose: "", whenToUse: "" },
      status: "ready",
      port: 0,
      directory: process.cwd(),
      sessionId: "session-errors",
      startedAt: new Date(),
      toolCount: 0,
      messageCount: 0,
      client: {
        session: {
          messages: async () => {
            throw new Error("temporary error");
          },
        },
      } as never,
    };

    const originalSetTimeout = globalThis.setTimeout;
    const originalClearTimeout = globalThis.clearTimeout;
    const queue: Array<() => Promise<void>> = [];
    globalThis.setTimeout = ((handler: (...args: unknown[]) => void) => {
      queue.push(() => Promise.resolve(handler()));
      return 0 as unknown as ReturnType<typeof setTimeout>;
    }) as typeof setTimeout;
    globalThis.clearTimeout = (() => {}) as typeof clearTimeout;

    try {
      const handle = startEventForwarding(instance, sessionManager, {} as never, { pollIntervalMs: 0 });
      let iterations = 0;
      while (queue.length > 0 && handle.isActive() && iterations < 20) {
        const next = queue.shift();
        if (next) await next();
        iterations += 1;
      }
      expect(handle.isActive()).toBe(false);
    } finally {
      globalThis.setTimeout = originalSetTimeout;
      globalThis.clearTimeout = originalClearTimeout;
    }
  });
});
