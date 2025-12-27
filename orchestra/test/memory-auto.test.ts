import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { recordMessageMemory } from "../src/memory/auto";
import { buildMemoryInjection } from "../src/memory/inject";
import { recentMemory, searchMemory } from "../src/memory/store";

describe("memory auto record (file)", () => {
  let tempDir = "";
  const originalXdg = process.env.XDG_CONFIG_HOME;
  const originalHome = process.env.HOME;
  const originalProjectDir = process.env.OPENCODE_ORCH_PROJECT_DIR;
  const originalNeo4j = {
    uri: process.env.OPENCODE_NEO4J_URI,
    username: process.env.OPENCODE_NEO4J_USERNAME,
    password: process.env.OPENCODE_NEO4J_PASSWORD,
    database: process.env.OPENCODE_NEO4J_DATABASE,
  };

  beforeAll(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "opencode-mem-"));
    process.env.XDG_CONFIG_HOME = tempDir;
    process.env.HOME = tempDir;
    process.env.OPENCODE_ORCH_PROJECT_DIR = tempDir;
    delete process.env.OPENCODE_NEO4J_URI;
    delete process.env.OPENCODE_NEO4J_USERNAME;
    delete process.env.OPENCODE_NEO4J_PASSWORD;
    delete process.env.OPENCODE_NEO4J_DATABASE;
  });

  afterAll(async () => {
    if (originalXdg) process.env.XDG_CONFIG_HOME = originalXdg;
    else delete process.env.XDG_CONFIG_HOME;
    if (originalHome) process.env.HOME = originalHome;
    else delete process.env.HOME;
    if (originalProjectDir) process.env.OPENCODE_ORCH_PROJECT_DIR = originalProjectDir;
    else delete process.env.OPENCODE_ORCH_PROJECT_DIR;
    if (originalNeo4j.uri) process.env.OPENCODE_NEO4J_URI = originalNeo4j.uri;
    else delete process.env.OPENCODE_NEO4J_URI;
    if (originalNeo4j.username) process.env.OPENCODE_NEO4J_USERNAME = originalNeo4j.username;
    else delete process.env.OPENCODE_NEO4J_USERNAME;
    if (originalNeo4j.password) process.env.OPENCODE_NEO4J_PASSWORD = originalNeo4j.password;
    else delete process.env.OPENCODE_NEO4J_PASSWORD;
    if (originalNeo4j.database) process.env.OPENCODE_NEO4J_DATABASE = originalNeo4j.database;
    else delete process.env.OPENCODE_NEO4J_DATABASE;
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
