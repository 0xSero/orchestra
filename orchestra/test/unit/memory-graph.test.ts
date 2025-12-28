import { describe, expect, test } from "bun:test";
import { requireProjectId, toNode } from "../../src/memory/graph/shared";
import type { Neo4jConfig } from "../../src/memory/neo4j";

type WithSession = typeof import("../../src/memory/neo4j").withNeo4jSession;

const cfg: Neo4jConfig = {
  uri: "bolt://localhost:7687",
  username: "neo4j",
  password: "password",
};

const makeRecord = (values: Record<string, unknown>) => ({
  get: (key: string) => values[key],
});

const fakeNode = {
  properties: {
    scope: "project",
    projectId: "project-1",
    key: "key-1",
    value: "value-1",
    tags: ["alpha", "beta"],
    createdAt: 1,
    updatedAt: 2,
  },
};

const fakeSession = {
  run: async (query: string) => {
    if (query.includes("projectsDropped")) {
      return { records: [makeRecord({ projectsDropped: 2, messagesDeleted: 5 })] };
    }
    if (query.includes("RETURN size(nodes) AS deleted")) {
      return { records: [makeRecord({ deleted: 3 })] };
    }
    if (query.includes("RETURN size(toDelete) AS deleted")) {
      return { records: [makeRecord({ deleted: 1 })] };
    }
    return { records: [makeRecord({ n: fakeNode })] };
  },
};

const withSession: WithSession = async (_cfg, fn) => await fn(fakeSession as never);

describe("memory graph helpers", () => {
  test("requires project id for project scope", () => {
    expect(requireProjectId("global", undefined)).toBeUndefined();
    expect(() => requireProjectId("project", undefined)).toThrow("projectId is required");
    expect(requireProjectId("project", "project-1")).toBe("project-1");
  });

  test("converts records into memory nodes", () => {
    const node = toNode(makeRecord({ n: fakeNode }) as never);
    expect(node.key).toBe("key-1");
    expect(node.projectId).toBe("project-1");
    expect(node.tags).toEqual(["alpha", "beta"]);
  });
});

describe("memory graph operations", () => {
  test("upserts and fetches memory nodes", async () => {
    const { upsertMemory, getMemoryByKey, searchMemory, recentMemory, linkMemory } = await import(
      "../../src/memory/graph"
    );

    const created = await upsertMemory({
      cfg,
      scope: "project",
      projectId: "project-1",
      key: "key-1",
      value: "value-1",
      deps: { withSession },
    });
    expect(created.key).toBe("key-1");

    const fetched = await getMemoryByKey({
      cfg,
      scope: "project",
      projectId: "project-1",
      key: "key-1",
      deps: { withSession },
    });
    expect(fetched?.value).toBe("value-1");

    const results = await searchMemory({
      cfg,
      scope: "project",
      projectId: "project-1",
      query: "key",
      limit: 5,
      deps: { withSession },
    });
    expect(results.length).toBeGreaterThan(0);

    const recent = await recentMemory({ cfg, scope: "global", limit: 2, deps: { withSession } });
    expect(recent.length).toBeGreaterThan(0);

    const linked = await linkMemory({
      cfg,
      scope: "global",
      fromKey: "a",
      toKey: "b",
      type: "relates_to",
      deps: { withSession },
    });
    expect(linked.ok).toBe(true);
  });

  test("trims memory nodes by prefix and projects", async () => {
    const { trimMemoryByKeyPrefix, trimGlobalMessageProjects } = await import("../../src/memory/graph");

    const deletedAll = await trimMemoryByKeyPrefix({
      cfg,
      scope: "global",
      keyPrefix: "message:",
      keepLatest: 0,
      deps: { withSession },
    });
    expect(deletedAll.deleted).toBe(3);

    const deletedSome = await trimMemoryByKeyPrefix({
      cfg,
      scope: "project",
      projectId: "project-1",
      keyPrefix: "message:",
      keepLatest: 2,
      deps: { withSession },
    });
    expect(deletedSome.deleted).toBe(1);

    const trimmed = await trimGlobalMessageProjects({ cfg, keepProjects: 1, deps: { withSession } });
    expect(trimmed.projectsDropped).toBe(2);
    expect(trimmed.messagesDeleted).toBe(5);

    const trimmedAll = await trimGlobalMessageProjects({ cfg, keepProjects: 0, deps: { withSession } });
    expect(trimmedAll.messagesDeleted).toBe(3);
  });
});
