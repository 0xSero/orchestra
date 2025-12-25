import type { Neo4jConfig } from "./neo4j";
import { loadNeo4jConfig } from "./neo4j";
import type { MemoryNode, MemoryScope } from "./graph";
import * as graph from "./graph";
import * as fileStore from "./store-file";

export type MemoryBackend = "neo4j" | "file";
export type { MemoryNode, MemoryScope };

function resolveBackend(cfg?: Neo4jConfig): { backend: MemoryBackend; cfg?: Neo4jConfig } {
  const resolved = cfg ?? loadNeo4jConfig();
  if (resolved) return { backend: "neo4j", cfg: resolved };
  return { backend: "file" };
}

export function getMemoryBackend(cfg?: Neo4jConfig): MemoryBackend {
  return resolveBackend(cfg).backend;
}

export async function upsertMemory(input: {
  cfg?: Neo4jConfig;
  scope: MemoryScope;
  projectId?: string;
  key: string;
  value: string;
  tags?: string[];
}): Promise<MemoryNode> {
  const { backend, cfg } = resolveBackend(input.cfg);
  if (backend === "neo4j") {
    return await graph.upsertMemory({
      cfg: cfg!,
      scope: input.scope,
      projectId: input.projectId,
      key: input.key,
      value: input.value,
      tags: input.tags ?? [],
    });
  }
  return await fileStore.upsertMemory({
    scope: input.scope,
    projectId: input.projectId,
    key: input.key,
    value: input.value,
    tags: input.tags ?? [],
  });
}

export async function linkMemory(input: {
  cfg?: Neo4jConfig;
  scope: MemoryScope;
  projectId?: string;
  fromKey: string;
  toKey: string;
  type?: string;
}): Promise<{ ok: true }> {
  const { backend, cfg } = resolveBackend(input.cfg);
  if (backend === "neo4j") {
    return await graph.linkMemory({
      cfg: cfg!,
      scope: input.scope,
      projectId: input.projectId,
      fromKey: input.fromKey,
      toKey: input.toKey,
      type: input.type,
    });
  }
  return await fileStore.linkMemory({
    scope: input.scope,
    projectId: input.projectId,
    fromKey: input.fromKey,
    toKey: input.toKey,
    type: input.type,
  });
}

export async function getMemoryByKey(input: {
  cfg?: Neo4jConfig;
  scope: MemoryScope;
  projectId?: string;
  key: string;
}): Promise<MemoryNode | undefined> {
  const { backend, cfg } = resolveBackend(input.cfg);
  if (backend === "neo4j") {
    return await graph.getMemoryByKey({
      cfg: cfg!,
      scope: input.scope,
      projectId: input.projectId,
      key: input.key,
    });
  }
  return await fileStore.getMemoryByKey({
    scope: input.scope,
    projectId: input.projectId,
    key: input.key,
  });
}

export async function searchMemory(input: {
  cfg?: Neo4jConfig;
  scope: MemoryScope;
  projectId?: string;
  query: string;
  limit?: number;
}): Promise<MemoryNode[]> {
  const { backend, cfg } = resolveBackend(input.cfg);
  if (backend === "neo4j") {
    return await graph.searchMemory({
      cfg: cfg!,
      scope: input.scope,
      projectId: input.projectId,
      query: input.query,
      limit: input.limit,
    });
  }
  return await fileStore.searchMemory({
    scope: input.scope,
    projectId: input.projectId,
    query: input.query,
    limit: input.limit,
  });
}

export async function recentMemory(input: {
  cfg?: Neo4jConfig;
  scope: MemoryScope;
  projectId?: string;
  limit?: number;
}): Promise<MemoryNode[]> {
  const { backend, cfg } = resolveBackend(input.cfg);
  if (backend === "neo4j") {
    return await graph.recentMemory({
      cfg: cfg!,
      scope: input.scope,
      projectId: input.projectId,
      limit: input.limit,
    });
  }
  return await fileStore.recentMemory({
    scope: input.scope,
    projectId: input.projectId,
    limit: input.limit,
  });
}

export async function trimMemoryByKeyPrefix(input: {
  cfg?: Neo4jConfig;
  scope: MemoryScope;
  projectId?: string;
  keyPrefix: string;
  keepLatest: number;
}): Promise<{ deleted: number }> {
  const { backend, cfg } = resolveBackend(input.cfg);
  if (backend === "neo4j") {
    return await graph.trimMemoryByKeyPrefix({
      cfg: cfg!,
      scope: input.scope,
      projectId: input.projectId,
      keyPrefix: input.keyPrefix,
      keepLatest: input.keepLatest,
    });
  }
  return await fileStore.trimMemoryByKeyPrefix({
    scope: input.scope,
    projectId: input.projectId,
    keyPrefix: input.keyPrefix,
    keepLatest: input.keepLatest,
  });
}

export async function trimGlobalMessageProjects(input: {
  cfg?: Neo4jConfig;
  keepProjects: number;
}): Promise<{ projectsDropped: number; messagesDeleted: number }> {
  const { backend, cfg } = resolveBackend(input.cfg);
  if (backend === "neo4j") {
    return await graph.trimGlobalMessageProjects({
      cfg: cfg!,
      keepProjects: input.keepProjects,
    });
  }
  return await fileStore.trimGlobalMessageProjects({
    keepProjects: input.keepProjects,
  });
}
