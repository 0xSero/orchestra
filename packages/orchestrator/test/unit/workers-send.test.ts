import { describe, expect, test } from "bun:test";
import { buildWorkerPromptBody } from "../../src/workers/send";

describe("buildWorkerPromptBody", () => {
  test("includes agent and model override", () => {
    const body = buildWorkerPromptBody({
      parts: [{ type: "text", text: "hello" }],
      agent: "agent",
      model: "openai/gpt-4o",
    });

    expect(body).toEqual({
      parts: [{ type: "text", text: "hello" }],
      agent: "agent",
      model: { providerID: "openai", modelID: "gpt-4o" },
    });
  });

  test("omits model when not provided", () => {
    const body = buildWorkerPromptBody({
      parts: [{ type: "text", text: "hello" }],
    });

    expect(body).toEqual({
      parts: [{ type: "text", text: "hello" }],
    });
  });

  test("throws on invalid model override", () => {
    expect(() =>
      buildWorkerPromptBody({
        parts: [{ type: "text", text: "hello" }],
        model: "node:fast",
      }),
    ).toThrow('Invalid model override "node:fast". Expected "provider/model".');
  });
});
