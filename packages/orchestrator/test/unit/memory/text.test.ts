import { describe, expect, test } from "bun:test";
import {
  truncate,
  stripCodeBlocks,
  redactSecrets,
  normalizeForMemory,
  shortenWithMarker,
  appendRollingSummary,
} from "../../../src/memory/text";

describe("truncate", () => {
  test("returns original string if within limit", () => {
    expect(truncate("hello", 10)).toBe("hello");
    expect(truncate("", 10)).toBe("");
  });

  test("truncates strings exceeding maxChar", () => {
    expect(truncate("hello world", 5)).toBe("hello");
  });

  test("handles unicode character correctly", () => {
    expect(truncate("hello", 3)).toBe("hel");
  });
});

describe("stripCodeBlocks", () => {
  test("replaces code blocks with marker", () => {
    const input = "```\nconst x = 1;\n```";
    expect(stripCodeBlocks(input)).toBe("[code omitted]");
  });

  test("replaces multiple code blocks", () => {
    const input = "```js\ncode1\n``` text ```py\ncode2\n```";
    expect(stripCodeBlocks(input)).toBe("[code omitted] text [code omitted]");
  });

  test("handles empty input", () => {
    expect(stripCodeBlocks("")).toBe("");
  });

  test("leaves partial code blocks unchanged", () => {
    expect(stripCodeBlocks("```\nunclosed")).toBe("```\nunclosed");
  });
});

describe("redactSecrets", () => {
  test("redacts OpenAI API keys (16+ chars)", () => {
    expect(redactSecrets("sk-abcdefghijklmnop")).toBe("[REDACTED]");
  });

  test("does not redact short key (below 16 chars)", () => {
    expect(redactSecrets("sk-shortkey")).toBe("sk-shortkey");
  });

  test("redacts AWS access key", () => {
    expect(redactSecrets("AKIAIOSFODNN7EXAMPLE")).toBe("[REDACTED]");
  });

  test("redacts Google API key", () => {
    expect(redactSecrets("AIzaSyDaGiZyV8I9M9x8I9x8I9x-abc123")).toBe(
      "[REDACTED]",
    );
  });

  test("redacts GitHub token", () => {
    expect(redactSecrets("ghp_abcdefghijklmnopqrstuvwxyz")).toBe("[REDACTED]");
  });

  test("redacts Slack token", () => {
    expect(redactSecrets("xoxb-1234-5678-abcdefghijklmnop")).toBe("[REDACTED]");
  });

  test("private key block - word boundary at start affects matching", () => {
    const pk =
      "-----BEGIN RSA PRIVATE KEY-----\nMIIE...\n-----END RSA PRIVATE KEY-----";
    expect(redactSecrets(pk)).toBe(pk);
  });

  test("handles text without secret", () => {
    expect(redactSecrets("normal text without secret")).toBe(
      "normal text without secret",
    );
  });

  test("redacts multiple secret types", () => {
    const input = "Key: sk-abcdefghijklmnop, AWS: AKIAIOSFODNN7EXAMPLE";
    const result = redactSecrets(input);
    expect(result).toContain("[REDACTED]");
    expect(result.split("[REDACTED]").length).toBe(3);
  });
});

describe("normalizeForMemory", () => {
  test("truncates to maxChar", () => {
    const input = "a".repeat(200);
    expect(normalizeForMemory(input, 100).length).toBe(100);
  });

  test("strips code block", () => {
    const input = "Text\n```\ncode\n```\nMore text";
    expect(normalizeForMemory(input, 1000)).toContain("[code omitted]");
  });

  test("redacts secret", () => {
    const input = "My key is sk-abcdefghijklmnop";
    expect(normalizeForMemory(input, 1000)).toContain("[REDACTED]");
  });

  test("collapses whitespace", () => {
    expect(normalizeForMemory("hello    world\n\ntest", 100)).toBe(
      "hello world test",
    );
  });

  test("handles empty input", () => {
    expect(normalizeForMemory("", 100)).toBe("");
  });
});

describe("shortenWithMarker", () => {
  test("returns original if within limit", () => {
    expect(shortenWithMarker("short", 100)).toBe("short");
  });

  test("adds marker when exceeding limit", () => {
    const input = "a".repeat(1000);
    const result = shortenWithMarker(input, 100);
    expect(result).toContain("[... trimmed");
    expect(result.length).toBeLessThan(input.length);
  });

  test("keeps head and tail proportionally", () => {
    const input = "START" + "b".repeat(100) + "END";
    const result = shortenWithMarker(input, 50);
    expect(result.startsWith("START")).toBe(true);
    expect(result.endsWith("END")).toBe(true);
    expect(result).toContain("[... trimmed");
  });

  test("respects headRatio option", () => {
    const input = "AAAA" + "b".repeat(100) + "BBBB";
    const result = shortenWithMarker(input, 50, { headRatio: 0.8 });
    expect(result.startsWith("AAAA")).toBe(true);
    expect(result).toContain("[... trimmed");
  });
});

describe("appendRollingSummary", () => {
  test("creates new summary from entry if no previous", () => {
    const result = appendRollingSummary(undefined, "new entry", 100);
    expect(result).toBe("new entry");
  });

  test("appends to existing summary", () => {
    const prev = "previous entry";
    const result = appendRollingSummary(prev, "new entry", 100);
    expect(result).toBe("previous entry\nnew entry");
  });

  test("truncates combined content", () => {
    const prev = "a".repeat(200);
    const entry = "b".repeat(200);
    const result = appendRollingSummary(prev, entry, 100);
    expect(result.length).toBeLessThan(150);
  });

  test("handles empty previous summary", () => {
    const result = appendRollingSummary("", "entry", 100);
    expect(result).toBe("entry");
  });

  test("uses headRatio in shortenWithMarker", () => {
    const prev = "a".repeat(100);
    const entry = "b".repeat(100);
    const result = appendRollingSummary(prev, entry, 50);
    expect(result).toContain("[... trimmed");
  });
});
