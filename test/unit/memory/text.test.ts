import { describe, expect, test } from "bun:test";
import { appendRollingSummary, normalizeForMemory, shortenWithMarker } from "../../../src/memory/text";

describe("memory text helpers", () => {
  test("normalizeForMemory strips code blocks, redacts secrets, and clamps length", () => {
    const input =
      "hello\n\n```ts\nconst key = 'sk-THISSHOULDBEREDACTED1234567890';\n```\n" +
      "and here is a token ghp_abcdefghijklmnopqrstuvwxyz1234567890\n";
    const out = normalizeForMemory(input, 80);
    expect(out).not.toContain("```");
    expect(out).toContain("[code omitted]");
    expect(out).not.toContain("sk-THISSHOULDBEREDACTED");
    expect(out).not.toContain("ghp_abcdefghijklmnopqrstuvwxyz");
    expect(out.length).toBeLessThanOrEqual(80);
  });

  test("shortenWithMarker enforces a hard max", () => {
    const input = "x".repeat(1000);
    const out = shortenWithMarker(input, 200);
    expect(out.length).toBeLessThanOrEqual(200);
    expect(out).toContain("trimmed");
  });

  test("appendRollingSummary keeps rolling text bounded", () => {
    const prev = "a".repeat(400);
    const entry = "b".repeat(400);
    const out = appendRollingSummary(prev, entry, 300);
    expect(out.length).toBeLessThanOrEqual(300);
    expect(out).toContain("trimmed");
  });
});
