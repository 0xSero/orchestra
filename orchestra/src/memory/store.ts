import type { MemoryNode, MemoryScope } from "./graph";
import * as graph from "./graph";
import type { Neo4jConfig } from "./neo4j";
import { loadNeo4jConfig } from "./neo4j";
import * as fileStore from "./store-file";

export type MemoryBackend = "neo4j" | "file";
export type { MemoryNode, MemoryScope };

type MemoryStoreDeps = {
  loadNeo4jConfig?: typeof loadNeo4jConfig;
  graph?: typeof graph;
  fileStore?: typeof fileStore;
};

function resolveBackend(cfg?: Neo4jConfig, deps?: MemoryStoreDeps): { backend: MemoryBackend; cfg?: Neo4jConfig } {
  const resolved = cfg ?? (deps?.loadNeo4jConfig ?? loadNeo4jConfig)();
  if (resolved) return { backend: "neo4j", cfg: resolved };
  return { backend: "file" };
}

export function getMemoryBackend(cfg?: Neo4jConfig, deps?: MemoryStoreDeps): MemoryBackend {
  return resolveBackend(cfg, deps).backend;
}

export async function upsertMemory(input: {
  cfg?: Neo4jConfig;
  scope: MemoryScope;
  projectId?: string;
  key: string;
  value: string;
  tags?: string[];
  deps?: MemoryStoreDeps;
}): Promise<MemoryNode> {
  const { backend, cfg } = resolveBackend(input.cfg, input.deps);
  const graphApi = input.deps?.graph ?? graph;
  const fileApi = input.deps?.fileStore ?? fileStore;
  if (backend === "neo4j") {
    return await graphApi.upsertMemory({
      cfg: cfg!,
      scope: input.scope,
      projectId: input.projectId,
      key: input.key,
      value: input.value,
      tags: input.tags ?? [],
    });
  }
  return await fileApi.upsertMemory({
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
  deps?: MemoryStoreDeps;
}): Promise<{ ok: true }> {
  const { backend, cfg } = resolveBackend(input.cfg, input.deps);
  const graphApi = input.deps?.graph ?? graph;
  const fileApi = input.deps?.fileStore ?? fileStore;
  if (backend === "neo4j") {
    return await graphApi.linkMemory({
      cfg: cfg!,
      scope: input.scope,
      projectId: input.projectId,
      fromKey: input.fromKey,
      toKey: input.toKey,
      type: input.type,
    });
  }
  return await fileApi.linkMemory({
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
  deps?: MemoryStoreDeps;
}): Promise<MemoryNode | undefined> {
  const { backend, cfg } = resolveBackend(input.cfg, input.deps);
  const graphApi = input.deps?.graph ?? graph;
  const fileApi = input.deps?.fileStore ?? fileStore;
  if (backend === "neo4j") {
    return await graphApi.getMemoryByKey({
      cfg: cfg!,
      scope: input.scope,
      projectId: input.projectId,
      key: input.key,
    });
  }
  return await fileApi.getMemoryByKey({
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
  deps?: MemoryStoreDeps;
}): Promise<MemoryNode[]> {
  const { backend, cfg } = resolveBackend(input.cfg, input.deps);
  const graphApi = input.deps?.graph ?? graph;
  const fileApi = input.deps?.fileStore ?? fileStore;
  if (backend === "neo4j") {
    return await graphApi.searchMemory({
      cfg: cfg!,
      scope: input.scope,
      projectId: input.projectId,
      query: input.query,
      limit: input.limit,
    });
  }
  return await fileApi.searchMemory({
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
  deps?: MemoryStoreDeps;
}): Promise<MemoryNode[]> {
  const { backend, cfg } = resolveBackend(input.cfg, input.deps);
  const graphApi = input.deps?.graph ?? graph;
  const fileApi = input.deps?.fileStore ?? fileStore;
  if (backend === "neo4j") {
    return await graphApi.recentMemory({
      cfg: cfg!,
      scope: input.scope,
      projectId: input.projectId,
      limit: input.limit,
    });
  }
  return await fileApi.recentMemory({
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
  deps?: MemoryStoreDeps;
}): Promise<{ deleted: number }> {
  const { backend, cfg } = resolveBackend(input.cfg, input.deps);
  const graphApi = input.deps?.graph ?? graph;
  const fileApi = input.deps?.fileStore ?? fileStore;
  if (backend === "neo4j") {
    return await graphApi.trimMemoryByKeyPrefix({
      cfg: cfg!,
      scope: input.scope,
      projectId: input.projectId,
      keyPrefix: input.keyPrefix,
      keepLatest: input.keepLatest,
    });
  }
  return await fileApi.trimMemoryByKeyPrefix({
    scope: input.scope,
    projectId: input.projectId,
    keyPrefix: input.keyPrefix,
    keepLatest: input.keepLatest,
  });
}

export async function trimGlobalMessageProjects(input: {
  cfg?: Neo4jConfig;
  keepProjects: number;
  deps?: MemoryStoreDeps;
}): Promise<{ projectsDropped: number; messagesDeleted: number }> {
  const { backend, cfg } = resolveBackend(input.cfg, input.deps);
  const graphApi = input.deps?.graph ?? graph;
  const fileApi = input.deps?.fileStore ?? fileStore;
  if (backend === "neo4j") {
    return await graphApi.trimGlobalMessageProjects({
      cfg: cfg!,
      keepProjects: input.keepProjects,
    });
  }
  return await fileApi.trimGlobalMessageProjects({
    keepProjects: input.keepProjects,
  });
}
