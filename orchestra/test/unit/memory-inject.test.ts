import { describe, expect, test } from "bun:test";
import { buildMemoryInjection } from "../../src/memory/inject";

describe("memory injection builder", () => {
  test("returns undefined when disabled", async () => {
    const result = await buildMemoryInjection({
      enabled: false,
      scope: "global",
    });
    expect(result).toBeUndefined();
  });

  test("builds injection with summaries and notes", async () => {
    const baseNode = {
      scope: "project" as const,
      projectId: "project-1",
      key: "note:1",
      value: "Remember the tokens.",
      tags: ["note"],
      createdAt: 1,
      updatedAt: 2,
    };

    const messageNode = {
      scope: "project" as const,
      projectId: "project-1",
      key: "message:session-1:1",
      value: "Message content",
      tags: [],
      createdAt: 1,
      updatedAt: 2,
    };

    const globalNode = {
      scope: "global" as const,
      key: "global:1",
      value: "Global memory",
      tags: [],
      createdAt: 1,
      updatedAt: 2,
    };

    const getMemoryByKey = async ({ key }: { key: string }) => {
      if (key === "summary:project") {
        return {
          ...baseNode,
          key,
          value: "Project summary text",
        };
      }
      if (key === "summary:session:session-1") {
        return {
          ...baseNode,
          key,
          value: "Session summary text",
        };
      }
      return undefined;
    };

    const recentMemory = async ({ scope }: { scope: "project" | "global" }) => {
      return scope === "project" ? [baseNode, messageNode] : [globalNode];
    };

    const injection = await buildMemoryInjection({
      enabled: true,
      cfg: { uri: "bolt://localhost", username: "neo4j", password: "pw" },
      scope: "project",
      projectId: "project-1",
      sessionId: "session-1",
      inject: { includeMessages: false, includeGlobal: true, maxEntries: 2, maxGlobalEntries: 1 },
      deps: { getMemoryByKey, recentMemory, loadNeo4jConfig: () => undefined },
    });

    expect(injection).toContain("## Memory (auto)");
    expect(injection).toContain("### Project");
    expect(injection).toContain("### Session");
    expect(injection).toContain("### Notes");
    expect(injection).toContain("`note:1`");
    expect(injection).toContain("`global:1`");
    expect(injection).not.toContain("message:session-1:1");
  });

  test("ignores summary lookup failures", async () => {
    const injection = await buildMemoryInjection({
      enabled: true,
      scope: "project",
      projectId: "project-1",
      sessionId: "session-1",
      deps: {
        getMemoryByKey: async () => {
          throw new Error("lookup failed");
        },
        recentMemory: async () => [],
        loadNeo4jConfig: () => undefined,
      },
    });

    expect(injection).toBeUndefined();
  });
});
