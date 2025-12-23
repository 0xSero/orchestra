import { describe, expect, test } from "bun:test";
import { benchmark } from "../helpers/benchmark";
import { appendRollingSummary, normalizeForMemory } from "../../src/memory/text";

describe("memory text (benchmarks)", () => {
  test("normalizeForMemory baseline", async () => {
    const input =
      "Here is some text with a code block:\n\n```ts\nconsole.log('hello')\n```\n" +
      "and a fake token sk-THISSHOULDBEREDACTED1234567890.\n" +
      "Repeat. ".repeat(200);

    const result = await benchmark(
      "normalizeForMemory",
      () => {
        normalizeForMemory(input, 2000);
      },
      { iterations: 500, warmup: 50 }
    );

    expect(result.opsPerSecond).toBeGreaterThan(0);
  });

  test("appendRollingSummary baseline", async () => {
    const prev = "a".repeat(2000);
    const entry = "b".repeat(600);

    const result = await benchmark(
      "appendRollingSummary",
      () => {
        appendRollingSummary(prev, entry, 2000);
      },
      { iterations: 500, warmup: 50 }
    );

    expect(result.opsPerSecond).toBeGreaterThan(0);
  });
});

