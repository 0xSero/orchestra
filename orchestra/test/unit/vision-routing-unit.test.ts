import { describe, expect, test } from "bun:test";
import {
  createVisionRoutingState,
  routeVisionMessage,
  syncVisionProcessedMessages,
} from "../../src/ux/vision-routing";

describe("vision routing", () => {
  test("skips non-user or already processed messages", async () => {
    const state = createVisionRoutingState();
    const deps = {
      workers: {
        getWorker: () => undefined,
        spawnById: async () => ({}),
        send: async () => ({ success: true, response: "ok" }),
      },
      profiles: { vision: { id: "vision", name: "Vision", model: "vision", purpose: "", whenToUse: "" } },
    };

    const output = { message: { role: "assistant" }, parts: [] as unknown[] };
    const res = await routeVisionMessage({ role: "assistant" }, output, deps as never, state);
    expect(res).toBeUndefined();

    const roleFromInput = { message: {}, parts: [{ type: "file", url: "data:image/png;base64,abc" }] };
    expect(await routeVisionMessage({ role: "assistant" }, roleFromInput as never, deps as never, state)).toBeUndefined();

    const noVision = { message: { role: "user" }, parts: [{ type: "text", text: "hello" }] };
    expect(await routeVisionMessage({ role: "user" }, noVision as never, deps as never, state)).toBeUndefined();

    state.processedMessageIds.add("msg-1");
    const already = {
      message: { role: "user" },
      parts: [{ type: "file", url: "data:image/png;base64,abc" }],
    };
    expect(
      await routeVisionMessage({ role: "user", messageID: "msg-1" }, already as never, deps as never, state),
    ).toBeUndefined();

    const visionAgent = {
      message: { role: "user" },
      parts: [{ type: "file", url: "data:image/png;base64,abc" }],
    };
    expect(
      await routeVisionMessage({ role: "user", agent: "vision" }, visionAgent as never, deps as never, state),
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
        spawnById: async () => ({}),
        send: async () => ({ success: true, response: "ok" }),
      },
      profiles: { vision: { id: "vision", name: "Vision", model: "vision", purpose: "", whenToUse: "" } },
      ensureWorker: async () => {},
      logSink: async () => {
        throw new Error("log failed");
      },
    };

    await routeVisionMessage({ role: "user", messageID: "msg-2" }, output as never, deps as never, state);
    expect(output.parts[0]?.text).toContain("<pasted_image>");
    expect(output.parts[0]?.text).toContain("No valid image attachments found");
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
        spawnById: async () => ({}),
        send: async () => ({ success: true, response: "Vision result" }),
      },
      profiles: { vision: { id: "vision", name: "Vision", model: "vision", purpose: "", whenToUse: "" } },
      logSink: async () => {
        throw new Error("log failed");
      },
    };

    await routeVisionMessage({ role: "user", messageID: "msg-3" }, output as never, deps as never, state);
    expect(output.parts[0]?.text).toContain("<pasted_image>");
    expect(output.parts[0]?.text).toContain("Vision result");
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
        spawnById: async () => ({}),
        send: async () => ({ success: true, response: "Vision ok" }),
      },
      profiles: { vision: { id: "vision", name: "Vision", model: "vision", purpose: "", whenToUse: "" } },
      communication: {
        emit: (type: string) => events.push(type),
      },
      logSink: async (entry: Record<string, unknown>) => {
        logs.push(entry);
      },
    };

    await routeVisionMessage({ role: "user", messageID: "msg-5" }, output as never, deps as never, state);
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
        spawnById: async () => ({}),
        send: async () => {
          throw new Error("vision down");
        },
      },
      profiles: { vision: { id: "vision", name: "Vision", model: "vision", purpose: "", whenToUse: "" } },
    };

    await routeVisionMessage({ role: "user", messageID: "msg-4" }, output as never, deps as never, state);
    expect(output.parts[0]?.text).toContain("<pasted_image>");
    expect(output.parts[0]?.text).toContain("vision down");
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
});
