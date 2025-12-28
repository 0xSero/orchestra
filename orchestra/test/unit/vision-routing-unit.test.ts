import { describe, expect, test } from "bun:test";
import { createVisionRoutingState, routeVisionMessage, syncVisionProcessedMessages } from "../../src/ux/vision-routing";
import type { VisionPart } from "../../src/ux/vision-types";

const baseJobs = {
  create: () => ({ id: "job-1" }),
  setResult: () => {},
};

const tick = async () => {
  await new Promise((resolve) => setTimeout(resolve, 0));
};

describe("vision routing", () => {
  test("skips non-user or already processed messages", async () => {
    const state = createVisionRoutingState();
    const deps = {
      workers: {
        getWorker: () => undefined,
        jobs: baseJobs,
        spawnById: async () => ({}),
        send: async () => ({ success: true, response: "ok" }),
        stopWorker: async () => true,
      },
      profiles: { vision: { id: "vision", name: "Vision", model: "vision", purpose: "", whenToUse: "" } },
    };

    const output = { message: { role: "assistant" }, parts: [] as VisionPart[] };
    const res = await routeVisionMessage({ role: "assistant", sessionID: "session-1" }, output, deps as never, state);
    expect(res).toBeUndefined();

    const roleFromInput = { message: {}, parts: [{ type: "file", url: "data:image/png;base64,abc" }] };
    expect(
      await routeVisionMessage(
        { role: "assistant", sessionID: "session-1" },
        roleFromInput as never,
        deps as never,
        state,
      ),
    ).toBeUndefined();

    const noVision = { message: { role: "user" }, parts: [{ type: "text", text: "hello" }] };
    expect(
      await routeVisionMessage({ role: "user", sessionID: "session-1" }, noVision as never, deps as never, state),
    ).toBeUndefined();

    state.processedMessageIds.add("msg-1");
    const already = {
      message: { role: "user" },
      parts: [{ type: "file", url: "data:image/png;base64,abc" }],
    };
    expect(
      await routeVisionMessage(
        { role: "user", messageID: "msg-1", sessionID: "session-1" },
        already as never,
        deps as never,
        state,
      ),
    ).toBeUndefined();

    const visionAgent = {
      message: { role: "user" },
      parts: [{ type: "file", url: "data:image/png;base64,abc" }],
    };
    expect(
      await routeVisionMessage(
        { role: "user", agent: "vision", sessionID: "session-1" },
        visionAgent as never,
        deps as never,
        state,
      ),
    ).toBeUndefined();
  });

  test("handles missing attachments and log sink failures", async () => {
    const state = createVisionRoutingState();
    const output = {
      message: { role: "user" },
      parts: [{ type: "file", url: "file:///missing.png", mime: "image/png" }],
    };

    const deps = {
      workers: {
        getWorker: () => ({}),
        jobs: baseJobs,
        spawnById: async () => ({}),
        send: async () => ({ success: true, response: "ok" }),
        stopWorker: async () => true,
      },
      profiles: { vision: { id: "vision", name: "Vision", model: "vision", purpose: "", whenToUse: "" } },
      ensureWorker: async () => {},
      logSink: async () => {
        throw new Error("log failed");
      },
    };

    await routeVisionMessage(
      { role: "user", messageID: "msg-2", sessionID: "session-2" },
      output as never,
      deps as never,
      state,
    );
    const missingText = output.parts[0] as { text?: string } | undefined;
    expect(missingText?.text).toContain("<pasted_image>");
    expect(missingText?.text).toContain("No valid image attachments found");
    expect(state.processedMessageIds.has("msg-2")).toBe(true);
  });

  test("routes images and handles worker responses", async () => {
    const state = createVisionRoutingState();
    const output = {
      message: { role: "user" },
      parts: [{ type: "image", base64: "Zm9v", mimeType: "image/png" }],
    };

    const deps = {
      workers: {
        getWorker: () => undefined,
        jobs: baseJobs,
        spawnById: async () => ({}),
        send: async () => ({ success: true, response: "Vision result" }),
        stopWorker: async () => true,
      },
      profiles: { vision: { id: "vision", name: "Vision", model: "vision", purpose: "", whenToUse: "" } },
      logSink: async () => {
        throw new Error("log failed");
      },
    };

    await routeVisionMessage(
      { role: "user", messageID: "msg-3", sessionID: "session-3" },
      output as never,
      deps as never,
      state,
    );
    const resultText = output.parts[0] as { text?: string } | undefined;
    expect(resultText?.text).toContain("<pasted_image job=");
    expect(resultText?.text).toContain("[VISION ANALYSIS IN PROGRESS]");
  });

  test("emits completion and logs successful analysis", async () => {
    const state = createVisionRoutingState();
    const output = {
      message: { role: "user" },
      parts: [{ type: "image", base64: "Zm9v", mimeType: "image/png" }],
    };

    const events: string[] = [];
    const logs: Array<Record<string, unknown>> = [];

    const deps = {
      workers: {
        getWorker: () => undefined,
        jobs: baseJobs,
        spawnById: async () => ({}),
        send: async () => ({ success: true, response: "Vision ok" }),
        stopWorker: async () => true,
      },
      profiles: { vision: { id: "vision", name: "Vision", model: "vision", purpose: "", whenToUse: "" } },
      communication: {
        emit: (type: string) => events.push(type),
      },
      logSink: async (entry: Record<string, unknown>) => {
        logs.push(entry);
      },
    };

    await routeVisionMessage(
      { role: "user", messageID: "msg-5", sessionID: "session-5" },
      output as never,
      deps as never,
      state,
    );
    await tick();
    expect(events).toContain("orchestra.vision.completed");
    expect(logs[0]?.status).toBe("succeeded");
  });

  test("handles worker errors", async () => {
    const state = createVisionRoutingState();
    const output = {
      message: { role: "user" },
      parts: [{ type: "image", base64: "Zm9v", mimeType: "image/png" }],
    };

    const deps = {
      workers: {
        getWorker: () => undefined,
        jobs: baseJobs,
        spawnById: async () => ({}),
        send: async () => {
          throw new Error("vision down");
        },
        stopWorker: async () => true,
      },
      profiles: { vision: { id: "vision", name: "Vision", model: "vision", purpose: "", whenToUse: "" } },
    };

    await routeVisionMessage(
      { role: "user", messageID: "msg-4", sessionID: "session-4" },
      output as never,
      deps as never,
      state,
    );
    const errorText = output.parts[0] as { text?: string } | undefined;
    expect(errorText?.text).toContain("<pasted_image job=");
    expect(errorText?.text).toContain("[VISION ANALYSIS IN PROGRESS]");
  });

  test("syncs processed message ids", () => {
    const state = createVisionRoutingState();
    const output = {
      messages: [
        {
          info: { id: "m1", role: "user" },
          parts: [{ type: "text", text: "[VISION ANALYSIS] done" }],
        },
      ],
    };
    syncVisionProcessedMessages(output as never, state);
    expect(state.processedMessageIds.has("m1")).toBe(true);
  });

  test("auto-stops vision worker after successful analysis", async () => {
    const state = createVisionRoutingState();
    const output = {
      message: { role: "user" },
      parts: [{ type: "image", base64: "Zm9v", mimeType: "image/png" }],
    };

    let stopCalled = false;
    const deps = {
      workers: {
        getWorker: () => undefined,
        jobs: baseJobs,
        spawnById: async () => ({}),
        send: async () => ({ success: true, response: "Vision ok" }),
        stopWorker: async () => {
          stopCalled = true;
          return true;
        },
      },
      profiles: { vision: { id: "vision", name: "Vision", model: "vision", purpose: "", whenToUse: "" } },
    };

    await routeVisionMessage(
      { role: "user", messageID: "msg-stop", sessionID: "session-stop" },
      output as never,
      deps as never,
      state,
    );
    await tick();
    expect(stopCalled).toBe(true);
  });

  test("does not stop vision worker when autoStopVisionWorker is false", async () => {
    const state = createVisionRoutingState();
    const output = {
      message: { role: "user" },
      parts: [{ type: "image", base64: "Zm9v", mimeType: "image/png" }],
    };

    let stopCalled = false;
    const deps = {
      workers: {
        getWorker: () => undefined,
        jobs: baseJobs,
        spawnById: async () => ({}),
        send: async () => ({ success: true, response: "Vision ok" }),
        stopWorker: async () => {
          stopCalled = true;
          return true;
        },
      },
      profiles: { vision: { id: "vision", name: "Vision", model: "vision", purpose: "", whenToUse: "" } },
      autoStopVisionWorker: false,
    };

    await routeVisionMessage(
      { role: "user", messageID: "msg-no-stop", sessionID: "session-no-stop" },
      output as never,
      deps as never,
      state,
    );
    expect(stopCalled).toBe(false);
  });

  test("handles stopWorker errors gracefully", async () => {
    const state = createVisionRoutingState();
    const output = {
      message: { role: "user" },
      parts: [{ type: "image", base64: "Zm9v", mimeType: "image/png" }],
    };

    const deps = {
      workers: {
        getWorker: () => undefined,
        jobs: baseJobs,
        spawnById: async () => ({}),
        send: async () => ({ success: true, response: "Vision ok" }),
        stopWorker: async () => {
          throw new Error("stop failed");
        },
      },
      profiles: { vision: { id: "vision", name: "Vision", model: "vision", purpose: "", whenToUse: "" } },
    };

    // Should not throw even when stopWorker fails
    await routeVisionMessage(
      { role: "user", messageID: "msg-stop-err", sessionID: "session-stop-err" },
      output as never,
      deps as never,
      state,
    );
    const resultText = output.parts[0] as { text?: string } | undefined;
    expect(resultText?.text).toContain("<pasted_image job=");
  });
});
