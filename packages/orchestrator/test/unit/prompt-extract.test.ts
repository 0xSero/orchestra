import { describe, expect, test } from "bun:test";
import { extractTextFromPromptResponse } from "../../src/workers/prompt";

describe("extractTextFromPromptResponse", () => {
  test("extracts text parts from the response", () => {
    const result = extractTextFromPromptResponse({
      parts: [
        { type: "text", text: "hello" },
        { type: "file", url: "file://ignored" },
        { type: "text", text: " world" },
      ],
    });

    expect(result.text).toBe("hello world");
    expect(result.debug).toBeUndefined();
  });

  test("reads parts from nested message payloads", () => {
    const result = extractTextFromPromptResponse({
      message: { parts: [{ type: "text", text: "pong" }] },
    });

    expect(result.text).toBe("pong");
    expect(result.debug).toBeUndefined();
  });

  test("returns debug when no text is present", () => {
    const result = extractTextFromPromptResponse({
      parts: [{ type: "file", url: "file://ignored" }],
    });

    expect(result.text).toBe("");
    expect(result.debug).toContain("parts:");
  });

  test("handles empty payloads", () => {
    const result = extractTextFromPromptResponse({});
    expect(result.text).toBe("");
    expect(result.debug).toBe("no_parts");
  });
});
