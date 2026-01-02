import { describe, expect, test } from "bun:test";
import {
  extractTextFromPromptResponse,
  extractStreamChunks,
} from "../../src/workers/prompt";

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

  test("handles null input gracefully", () => {
    const result = extractTextFromPromptResponse(null);
    expect(result.text).toBe("");
    expect(result.debug).toBe("no_parts");
  });

  test("ignores null parts in array", () => {
    const result = extractTextFromPromptResponse({
      parts: [
        { type: "text", text: "valid" },
        null,
        { type: "text", text: "more" },
      ],
    });
    expect(result.text).toBe("validmore");
  });

  test("extracts only text parts, ignores reasoning", () => {
    const result = extractTextFromPromptResponse({
      parts: [
        { type: "reasoning", text: "thinking..." },
        { type: "text", text: "answer" },
      ],
    });
    expect(result.text).toBe("answer");
  });
});

describe("extractStreamChunks", () => {
  test("extracts stream_chunk tool output", () => {
    const result = extractStreamChunks({
      parts: [
        {
          type: "tool",
          tool: "stream_chunk",
          state: { input: { chunk: "chunk1" } },
        },
        {
          type: "tool",
          tool: "stream_chunk",
          state: { input: { chunk: "chunk2" } },
        },
      ],
    });
    expect(result).toBe("chunk1chunk2");
  });

  test("reads from nested message.parts", () => {
    const result = extractStreamChunks({
      message: {
        parts: [
          {
            type: "tool",
            tool: "stream_chunk",
            state: { input: { chunk: "nested" } },
          },
        ],
      },
    });
    expect(result).toBe("nested");
  });

  test("filters out non-stream_chunk tools", () => {
    const result = extractStreamChunks({
      parts: [
        {
          type: "tool",
          tool: "some_other_tool",
          state: { input: { chunk: "ignored" } },
        },
      ],
    });
    expect(result).toBe("");
  });

  test("handles missing state gracefully", () => {
    const result = extractStreamChunks({
      parts: [{ type: "tool", tool: "stream_chunk", state: null }],
    });
    expect(result).toBe("");
  });

  test("handles missing chunk gracefully", () => {
    const result = extractStreamChunks({
      parts: [{ type: "tool", tool: "stream_chunk", state: { input: {} } }],
    });
    expect(result).toBe("");
  });

  test("returns empty for non-array parts", () => {
    const result = extractStreamChunks({});
    expect(result).toBe("");
  });

  test("filters empty chunk", () => {
    const result = extractStreamChunks({
      parts: [
        {
          type: "tool",
          tool: "stream_chunk",
          state: { input: { chunk: "valid" } },
        },
        {
          type: "tool",
          tool: "stream_chunk",
          state: { input: { chunk: "" } },
        },
      ],
    });
    expect(result).toBe("valid");
  });
});
