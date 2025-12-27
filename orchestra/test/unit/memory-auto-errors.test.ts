import { describe, expect, test } from "bun:test";
import { recordMessageMemory } from "../../src/memory/auto";

let getMemoryCalls = 0;

describe("memory auto error handling", () => {
  test("recordMessageMemory tolerates summary lookup failures", async () => {
    getMemoryCalls = 0;
    const deps = {
      getMemoryByKey: async () => {
        getMemoryCalls += 1;
        throw new Error("lookup failed");
      },
      linkMemory: async () => ({ ok: true }),
      trimGlobalMessageProjects: async () => {},
      trimMemoryByKeyPrefix: async () => {},
      upsertMemory: async () => ({}) as never,
      loadNeo4jConfig: () => undefined,
    };

    await recordMessageMemory({
      text: "hello",
      scope: "project",
      projectId: "project-1",
      sessionId: "session-1",
      role: "user",
      userId: "user-1",
      summaries: { enabled: true },
      deps,
    });

    expect(getMemoryCalls).toBeGreaterThan(0);
  });
});
