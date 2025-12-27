import { describe, expect, test } from "bun:test";
import {
  appendRollingSummary,
  normalizeForMemory,
  redactSecrets,
  shortenWithMarker,
  stripCodeBlocks,
  truncate,
} from "../../src/memory/text";

describe("memory text utilities", () => {
  test("truncate respects maxChars", () => {
    expect(truncate("short", 10)).toBe("short");
    expect(truncate("longer", 3)).toBe("lon");
  });

  test("stripCodeBlocks replaces fenced code", () => {
    const input = "before```js\nconsole.log(1)\n```after";
    expect(stripCodeBlocks(input)).toContain("[code omitted]");
  });

  test("redactSecrets replaces known patterns", () => {
    const input = "token sk-1234567890abcdef and ghp_abcdefghijklmnopqrst";
    const redacted = redactSecrets(input);
    expect(redacted).not.toContain("sk-");
    expect(redacted).toContain("[REDACTED]");
  });

  test("normalizeForMemory strips code and trims", () => {
    const input = " hello ```js\nconst x=1;\n``` world ";
    expect(normalizeForMemory(input, 50)).toBe("hello [code omitted] world");
  });

  test("shortenWithMarker adds marker when needed", () => {
    const text = "a".repeat(200);
    const shortened = shortenWithMarker(text, 50, { headRatio: 0.5 });
    expect(shortened).toContain("[... trimmed");
  });

  test("appendRollingSummary concatenates entries", () => {
    const summary = appendRollingSummary("first", "second", 100);
    expect(summary).toContain("first");
    expect(summary).toContain("second");
  });
});
