import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { recordMessageMemory } from "../src/memory/auto";
import { recentMemory, searchMemory } from "../src/memory/store";
import { buildMemoryInjection } from "../src/memory/inject";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("memory auto record (file)", () => {
  let tempDir = "";
  const originalXdg = process.env.XDG_CONFIG_HOME;

  beforeAll(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "opencode-mem-"));
    process.env.XDG_CONFIG_HOME = tempDir;
  });

  afterAll(async () => {
    if (originalXdg) process.env.XDG_CONFIG_HOME = originalXdg;
    else delete process.env.XDG_CONFIG_HOME;
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true }).catch(() => {});
    }
  });

  test("records messages and supports injection", async () => {
    const projectId = `test-project-${Date.now()}`;
    const sessionId = "session-test";
    const baseText = `memory-auto-${Math.random().toString(36).slice(2)}`;

    const common = {
      sessionId,
      role: "user",
      userId: "tester",
      scope: "project" as const,
      projectId,
      maxChars: 2000,
      summaries: { enabled: true, sessionMaxChars: 500, projectMaxChars: 500 },
      trim: { maxMessagesPerSession: 3, maxMessagesPerProject: 5 },
    };

    await recordMessageMemory({
      ...common,
      text: baseText,
      messageId: `msg-${Date.now()}`,
    });

    for (let i = 0; i < 6; i++) {
      await recordMessageMemory({
        ...common,
        text: `memory-auto-extra-${i}-${Math.random().toString(36).slice(2)}`,
        messageId: `msg-extra-${Date.now()}-${i}`,
      });
    }

    const results = await searchMemory({
      scope: "project",
      projectId,
      query: baseText,
      limit: 5,
    });

    expect(results.length).toBeGreaterThan(0);
    expect(results.some((r) => r.value.includes(baseText))).toBe(true);

    const recent = await recentMemory({ scope: "project", projectId, limit: 50 });
    const sessionMessages = recent.filter((r) => r.key.startsWith(`message:${sessionId}:`));
    expect(sessionMessages.length).toBeLessThanOrEqual(3);

    const injection = await buildMemoryInjection({
      enabled: true,
      scope: "project",
      projectId,
      sessionId,
      inject: { maxEntries: 6 },
    });

    expect(injection).toBeTruthy();
    expect(injection).toContain("Memory (auto)");
  });
});
