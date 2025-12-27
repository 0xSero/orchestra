import { describe, expect, test, mock } from "bun:test";

let getMemoryCalls = 0;

describe("memory auto error handling", () => {
  test("recordMessageMemory tolerates summary lookup failures", async () => {
    mock.module("../../src/memory/store", () => ({
      getMemoryByKey: async () => {
        getMemoryCalls += 1;
        throw new Error("lookup failed");
      },
      linkMemory: async () => ({ ok: true }),
      trimGlobalMessageProjects: async () => {},
      trimMemoryByKeyPrefix: async () => {},
      upsertMemory: async () => ({}) as never,
    }));

    mock.module("../../src/memory/neo4j", () => ({
      loadNeo4jConfig: () => undefined,
    }));

    const { recordMessageMemory } = await import("../../src/memory/auto");

    try {
      await recordMessageMemory({
        text: "hello",
        scope: "project",
        projectId: "project-1",
        sessionId: "session-1",
        role: "user",
        userId: "user-1",
        summaries: { enabled: true },
      });
    } finally {
      mock.restore();
    }

    expect(getMemoryCalls).toBeGreaterThan(0);
  });
});
