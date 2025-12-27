import { describe, expect, test } from "bun:test";
import { sendWorkerMessage } from "../../src/workers/send";
import type { WorkerInstance } from "../../src/types";
import type { WorkerRegistry } from "../../src/workers/registry";

const buildRegistry = (instance?: WorkerInstance, readyResult = true) =>
  ({
    get: () => instance,
    waitForStatus: async () => readyResult,
    updateStatus: (_id: string, status: string, error?: string) => {
      if (instance) {
        instance.status = status as WorkerInstance["status"];
        if (error) instance.error = error;
      }
    },
  }) as unknown as WorkerRegistry;

const buildInstance = (overrides?: Partial<WorkerInstance>): WorkerInstance => ({
  profile: { id: "alpha", name: "Alpha", model: "model-a", purpose: "", whenToUse: "" },
  status: "ready",
  port: 0,
  directory: process.cwd(),
  sessionId: "session-1",
  client: {
    session: {
      prompt: async () => ({ parts: [{ type: "text", text: "ok" }] }),
    },
  } as never,
  ...overrides,
});

describe("send worker message", () => {
  test("returns errors for missing workers and bad status", async () => {
    const missing = await sendWorkerMessage({ registry: buildRegistry(), workerId: "none", message: "hi" });
    expect(missing.success).toBe(false);
    expect(missing.error).toContain("not found");

    const instance = buildInstance({ status: "error" });
    const badStatus = await sendWorkerMessage({
      registry: buildRegistry(instance),
      workerId: "alpha",
      message: "hi",
    });
    expect(badStatus.success).toBe(false);
    expect(badStatus.error).toContain("error");
  });

  test("returns error when worker never becomes ready", async () => {
    const instance = buildInstance({ status: "starting" });
    const result = await sendWorkerMessage({
      registry: buildRegistry(instance, false),
      workerId: "alpha",
      message: "hi",
      options: { timeoutMs: 1 },
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain("did not become ready");
  });

  test("returns error when worker is not initialized", async () => {
    const instance = buildInstance({ client: undefined, sessionId: undefined });
    const result = await sendWorkerMessage({
      registry: buildRegistry(instance),
      workerId: "alpha",
      message: "hi",
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain("not properly initialized");
  });

  test("records warnings when beforePrompt throws", async () => {
    const instance = buildInstance();
    const result = await sendWorkerMessage({
      registry: buildRegistry(instance),
      workerId: "alpha",
      message: "hi",
      beforePrompt: async () => {
        throw new Error("boom");
      },
    });
    expect(result.success).toBe(true);
    expect(instance.warning).toContain("Pre-prompt hook failed");
  });

  test("includes job metadata in prompt text", async () => {
    let promptArgs: { body?: { parts?: Array<{ text?: string }> } } | undefined;
    const instance = buildInstance({
      client: {
        session: {
          prompt: async (args: { body?: { parts?: Array<{ text?: string }> } }) => {
            promptArgs = args;
            return { parts: [{ type: "text", text: "ok" }] };
          },
        },
      } as never,
    });

    const result = await sendWorkerMessage({
      registry: buildRegistry(instance),
      workerId: "alpha",
      message: "hi",
      options: { jobId: "job-1", from: "worker-2" },
    });

    expect(result.success).toBe(true);
    const text = promptArgs?.body?.parts?.[0]?.text ?? "";
    expect(text).toContain("orchestrator-job");
    expect(text).toContain('worker "worker-2"');
  });

  test("handles sdk errors with different shapes", async () => {
    const cases = [
      { error: new Error("fail"), expected: "fail" },
      { error: "string error", expected: "string error" },
      { error: { data: { message: "data error" } }, expected: "data error" },
      { error: { message: "message error" }, expected: "message error" },
      { error: { code: "E" }, expected: "{\"code\":\"E\"}" },
      { error: (() => { const obj: any = {}; obj.self = obj; return obj; })(), expected: "[object Object]" },
    ];

    for (const { error, expected } of cases) {
      const instance = buildInstance({
        client: {
          session: {
            prompt: async () => ({ error }),
          },
        } as never,
      });
      const result = await sendWorkerMessage({
        registry: buildRegistry(instance),
        workerId: "alpha",
        message: "hi",
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain(expected);
    }
  });

  test("times out when prompt never resolves", async () => {
    const instance = buildInstance({
      client: {
        session: {
          prompt: async () => new Promise(() => {}),
        },
      } as never,
    });
    const result = await sendWorkerMessage({
      registry: buildRegistry(instance),
      workerId: "alpha",
      message: "hi",
      options: { timeoutMs: 1 },
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain("timed out");
  });
});
