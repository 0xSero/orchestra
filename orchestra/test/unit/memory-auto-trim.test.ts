import { describe, expect, test } from "bun:test";
import { recordMessageMemory } from "../../src/memory/auto";

describe("memory auto trimming", () => {
  test("trims global scope and project summaries", async () => {
    const trimCalls: Array<{ scope: string; keyPrefix?: string; keepLatest?: number }> = [];
    const globalTrimCalls: Array<{ keepProjects: number }> = [];

    const deps = {
      getMemoryByKey: async () => ({
        scope: "global" as const,
        key: "summary",
        value: "prev",
        tags: [] as string[],
      }),
      linkMemory: async () => ({ ok: true }) as const,
      trimGlobalMessageProjects: async (input: { keepProjects: number }) => {
        globalTrimCalls.push(input);
        return { projectsDropped: 0, messagesDeleted: 0 };
      },
      trimMemoryByKeyPrefix: async (input: { scope: string; keyPrefix: string; keepLatest: number }) => {
        trimCalls.push(input);
        return { deleted: 0 };
      },
      upsertMemory: async () => ({}) as never,
      loadNeo4jConfig: () => undefined,
    };

    await recordMessageMemory({
      text: "hello",
      scope: "global",
      projectId: "project-1",
      sessionId: "session-1",
      role: "user",
      userId: "user-1",
      summaries: { enabled: true },
      trim: {
        maxMessagesPerSession: 1,
        maxMessagesPerProject: 2,
        maxMessagesGlobal: 3,
        maxProjectsGlobal: 4,
      },
      deps,
    });

    expect(trimCalls.some((c) => c.keyPrefix === "message:project-1:session-1:")).toBe(true);
    expect(trimCalls.some((c) => c.keyPrefix === "message:project-1:")).toBe(true);
    expect(trimCalls.some((c) => c.keyPrefix === "message:")).toBe(true);
    expect(globalTrimCalls[0]?.keepProjects).toBe(4);
  });

  test("trims project scope and writes session summaries", async () => {
    const trimCalls: Array<{ scope: string; keyPrefix?: string; keepLatest?: number }> = [];
    const getCalls: string[] = [];

    const deps = {
      getMemoryByKey: async (input: { key: string }) => {
        getCalls.push(input.key);
        return { scope: "project" as const, key: input.key, value: "prev", tags: [] as string[] };
      },
      linkMemory: async () => ({ ok: true }) as const,
      trimGlobalMessageProjects: async () => ({ projectsDropped: 0, messagesDeleted: 0 }),
      trimMemoryByKeyPrefix: async (input: { scope: string; keyPrefix: string; keepLatest: number }) => {
        trimCalls.push(input);
        return { deleted: 0 };
      },
      upsertMemory: async () => ({}) as never,
      loadNeo4jConfig: () => undefined,
    };

    await recordMessageMemory({
      text: "hello",
      scope: "project",
      projectId: "project-2",
      sessionId: "session-2",
      role: "assistant",
      userId: "user-2",
      summaries: { enabled: true, sessionMaxChars: 300, projectMaxChars: 300 },
      trim: {
        maxMessagesPerSession: 2,
        maxMessagesPerProject: 3,
      },
      deps,
    });

    expect(getCalls).toContain("summary:project");
    expect(getCalls).toContain("summary:session:session-2");
    expect(trimCalls.some((c) => c.keyPrefix === "message:session-2:")).toBe(true);
    expect(trimCalls.some((c) => c.keyPrefix === "message:")).toBe(true);
  });
});
