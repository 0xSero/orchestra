import { describe, expect, test } from "bun:test";
import type { MemoryNode } from "../../src/memory/store";
import {
  getMemoryBackend,
  getMemoryByKey,
  linkMemory,
  recentMemory,
  searchMemory,
  trimGlobalMessageProjects,
  trimMemoryByKeyPrefix,
  upsertMemory,
} from "../../src/memory/store";

describe("memory store backend selection", () => {
  const cfg = { uri: "bolt://localhost:7687", username: "neo4j", password: "pw" };

  const neoNode: MemoryNode = {
    scope: "global",
    key: "neo",
    value: "neo-value",
    tags: [],
    createdAt: 1,
    updatedAt: 1,
  };

  const graphStub = {
    upsertMemory: async () => neoNode,
    linkMemory: async () => ({ ok: true as const }),
    getMemoryByKey: async () => neoNode,
    searchMemory: async () => [neoNode],
    recentMemory: async () => [neoNode],
    trimMemoryByKeyPrefix: async () => ({ deleted: 1 }),
    trimGlobalMessageProjects: async () => ({ projectsDropped: 1, messagesDeleted: 2 }),
  };

  test("routes to neo4j backend when config is present", async () => {
    const deps = { graph: graphStub };
    expect(getMemoryBackend(cfg, deps)).toBe("neo4j");

    const created = await upsertMemory({ cfg, scope: "global", key: "neo", value: "neo", deps });
    expect(created.key).toBe("neo");

    const linked = await linkMemory({ cfg, scope: "global", fromKey: "a", toKey: "b", deps });
    expect(linked.ok).toBe(true);

    const fetched = await getMemoryByKey({ cfg, scope: "global", key: "neo", deps });
    expect(fetched?.key).toBe("neo");

    const search = await searchMemory({ cfg, scope: "global", query: "neo", deps });
    expect(search.length).toBe(1);

    const recent = await recentMemory({ cfg, scope: "global", deps });
    expect(recent.length).toBe(1);

    const trimmed = await trimMemoryByKeyPrefix({ cfg, scope: "global", keyPrefix: "neo", keepLatest: 1, deps });
    expect(trimmed.deleted).toBe(1);

    const projectTrim = await trimGlobalMessageProjects({ cfg, keepProjects: 1, deps });
    expect(projectTrim.projectsDropped).toBe(1);
  });

  test("uses loadNeo4jConfig override to select backend", () => {
    const backend = getMemoryBackend(undefined, {
      loadNeo4jConfig: () => cfg,
    });
    expect(backend).toBe("neo4j");
  });
});
