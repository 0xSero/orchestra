import { describe, expect, test } from "bun:test";
import type { MemoryNode } from "../../src/memory/store";
import type { Neo4jConfig } from "../../src/memory/neo4j";
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
  test("routes to neo4j when config is present", async () => {
    const cfg = { uri: "bolt://localhost:7687", username: "neo4j", password: "pw" } as Neo4jConfig;
    const graphCalls: string[] = [];
    const graph = {
      upsertMemory: async (input: { key: string }) => {
        graphCalls.push(`upsert:${input.key}`);
        return { key: input.key } as MemoryNode;
      },
      linkMemory: async (input: { fromKey: string; toKey: string }) => {
        graphCalls.push(`link:${input.fromKey}:${input.toKey}`);
        return { ok: true };
      },
      getMemoryByKey: async (input: { key: string }) => {
        graphCalls.push(`get:${input.key}`);
        return { key: input.key } as MemoryNode;
      },
      searchMemory: async (input: { query: string }) => {
        graphCalls.push(`search:${input.query}`);
        return [] as MemoryNode[];
      },
      recentMemory: async () => {
        graphCalls.push("recent");
        return [] as MemoryNode[];
      },
      trimMemoryByKeyPrefix: async (input: { keyPrefix: string }) => {
        graphCalls.push(`trim:${input.keyPrefix}`);
        return { deleted: 1 };
      },
      trimGlobalMessageProjects: async () => {
        graphCalls.push("trim-global");
        return { projectsDropped: 0, messagesDeleted: 0 };
      },
    };

    expect(getMemoryBackend(cfg)).toBe("neo4j");

    await upsertMemory({ cfg, scope: "global", key: "k1", value: "v1", deps: { graph } });
    await linkMemory({ cfg, scope: "global", fromKey: "k1", toKey: "k2", deps: { graph } });
    await getMemoryByKey({ cfg, scope: "global", key: "k1", deps: { graph } });
    await searchMemory({ cfg, scope: "global", query: "q", deps: { graph } });
    await recentMemory({ cfg, scope: "global", deps: { graph } });
    await trimMemoryByKeyPrefix({ cfg, scope: "global", keyPrefix: "k", keepLatest: 1, deps: { graph } });
    await trimGlobalMessageProjects({ cfg, keepProjects: 1, deps: { graph } });

    expect(graphCalls).toContain("upsert:k1");
    expect(graphCalls).toContain("link:k1:k2");
    expect(graphCalls).toContain("get:k1");
    expect(graphCalls).toContain("search:q");
    expect(graphCalls).toContain("recent");
    expect(graphCalls).toContain("trim:k");
    expect(graphCalls).toContain("trim-global");
  });

  test("routes to file store when no config is available", async () => {
    const fileCalls: string[] = [];
    const deps = { loadNeo4jConfig: () => undefined };
    const fileStore = {
      upsertMemory: async (input: { key: string }) => {
        fileCalls.push(`upsert:${input.key}`);
        return { key: input.key } as MemoryNode;
      },
      linkMemory: async (input: { fromKey: string; toKey: string }) => {
        fileCalls.push(`link:${input.fromKey}:${input.toKey}`);
        return { ok: true };
      },
      getMemoryByKey: async (input: { key: string }) => {
        fileCalls.push(`get:${input.key}`);
        return { key: input.key } as MemoryNode;
      },
      searchMemory: async (input: { query: string }) => {
        fileCalls.push(`search:${input.query}`);
        return [] as MemoryNode[];
      },
      recentMemory: async () => {
        fileCalls.push("recent");
        return [] as MemoryNode[];
      },
      trimMemoryByKeyPrefix: async (input: { keyPrefix: string }) => {
        fileCalls.push(`trim:${input.keyPrefix}`);
        return { deleted: 0 };
      },
      trimGlobalMessageProjects: async () => {
        fileCalls.push("trim-global");
        return { projectsDropped: 0, messagesDeleted: 0 };
      },
    };

    expect(getMemoryBackend(undefined, deps)).toBe("file");

    await upsertMemory({ scope: "global", key: "k1", value: "v1", deps: { fileStore, ...deps } });
    await linkMemory({ scope: "global", fromKey: "k1", toKey: "k2", deps: { fileStore, ...deps } });
    await getMemoryByKey({ scope: "global", key: "k1", deps: { fileStore, ...deps } });
    await searchMemory({ scope: "global", query: "q", deps: { fileStore, ...deps } });
    await recentMemory({ scope: "global", deps: { fileStore, ...deps } });
    await trimMemoryByKeyPrefix({ scope: "global", keyPrefix: "k", keepLatest: 1, deps: { fileStore, ...deps } });
    await trimGlobalMessageProjects({ keepProjects: 1, deps: { fileStore, ...deps } });

    expect(fileCalls).toContain("upsert:k1");
    expect(fileCalls).toContain("link:k1:k2");
    expect(fileCalls).toContain("get:k1");
    expect(fileCalls).toContain("search:q");
    expect(fileCalls).toContain("recent");
    expect(fileCalls).toContain("trim:k");
    expect(fileCalls).toContain("trim-global");
  });

  test("resolves backend from loadNeo4jConfig override", () => {
    const cfg = { uri: "bolt://localhost:7687", username: "neo4j", password: "pw" } as Neo4jConfig;
    expect(getMemoryBackend(undefined, { loadNeo4jConfig: () => cfg })).toBe("neo4j");
  });
});
