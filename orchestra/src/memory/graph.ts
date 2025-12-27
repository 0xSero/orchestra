import type { Record } from "neo4j-driver";
import type { MemoryNode, MemoryRecordShape, MemoryScope } from "./graph/shared";
import { requireProjectId, toNode } from "./graph/shared";
import type { Neo4jConfig } from "./neo4j";
import { withNeo4jSession } from "./neo4j";

export async function upsertMemory(input: {
  cfg: Neo4jConfig;
  scope: MemoryScope;
  projectId?: string;
  key: string;
  value: string;
  tags?: string[];
  deps?: { withSession?: typeof withNeo4jSession };
}): Promise<MemoryNode> {
  const scope = input.scope;
  const projectId = requireProjectId(scope, input.projectId);
  const withSession = input.deps?.withSession ?? withNeo4jSession;

  return await withSession(input.cfg, async (session) => {
    const mergePattern =
      scope === "project" ? `{ scope: $scope, projectId: $projectId, key: $key }` : `{ scope: $scope, key: $key }`;
    const res = await session.run(
      `
MERGE (n:Memory ${mergePattern})
ON CREATE SET n.createdAt = timestamp()
SET n.value = $value,
    n.tags = $tags,
    n.updatedAt = timestamp()
RETURN n
      `.trim(),
      {
        scope,
        ...(scope === "project" ? { projectId } : {}),
        key: input.key,
        value: input.value,
        tags: input.tags ?? [],
      },
    );
    const rec = res.records?.[0] as Record<MemoryRecordShape> | undefined;
    if (!rec) throw new Error("No record returned from Neo4j");
    return toNode(rec);
  });
}

export async function linkMemory(input: {
  cfg: Neo4jConfig;
  scope: MemoryScope;
  projectId?: string;
  fromKey: string;
  toKey: string;
  type?: string;
  deps?: { withSession?: typeof withNeo4jSession };
}): Promise<{ ok: true }> {
  const scope = input.scope;
  const projectId = requireProjectId(scope, input.projectId);
  const type = input.type ?? "relates_to";
  const withSession = input.deps?.withSession ?? withNeo4jSession;

  await withSession(input.cfg, async (session) => {
    await session.run(
      `
MATCH (a:Memory ${scope === "project" ? `{ scope: $scope, projectId: $projectId, key: $fromKey }` : `{ scope: $scope, key: $fromKey }`})
MATCH (b:Memory ${scope === "project" ? `{ scope: $scope, projectId: $projectId, key: $toKey }` : `{ scope: $scope, key: $toKey }`})
MERGE (a)-[r:RELATES_TO { type: $type }]->(b)
SET r.updatedAt = timestamp()
RETURN r
      `.trim(),
      {
        scope,
        ...(scope === "project" ? { projectId } : {}),
        fromKey: input.fromKey,
        toKey: input.toKey,
        type,
      },
    );
  });

  return { ok: true };
}

export async function getMemoryByKey(input: {
  cfg: Neo4jConfig;
  scope: MemoryScope;
  projectId?: string;
  key: string;
  deps?: { withSession?: typeof withNeo4jSession };
}): Promise<MemoryNode | undefined> {
  const scope = input.scope;
  const projectId = requireProjectId(scope, input.projectId);
  const withSession = input.deps?.withSession ?? withNeo4jSession;

  return await withSession(input.cfg, async (session) => {
    const matchPattern =
      scope === "project" ? `{ scope: $scope, projectId: $projectId, key: $key }` : `{ scope: $scope, key: $key }`;
    const res = await session.run(
      `
MATCH (n:Memory ${matchPattern})
RETURN n
LIMIT 1
      `.trim(),
      {
        scope,
        ...(scope === "project" ? { projectId } : {}),
        key: input.key,
      },
    );
    const rec = res.records?.[0] as Record<MemoryRecordShape> | undefined;
    if (!rec) return undefined;
    return toNode(rec);
  });
}

export async function searchMemory(input: {
  cfg: Neo4jConfig;
  scope: MemoryScope;
  projectId?: string;
  query: string;
  limit?: number;
  deps?: { withSession?: typeof withNeo4jSession };
}): Promise<MemoryNode[]> {
  const scope = input.scope;
  const projectId = requireProjectId(scope, input.projectId);
  const limit = Math.floor(Math.max(1, Math.min(50, input.limit ?? 10)));
  const withSession = input.deps?.withSession ?? withNeo4jSession;

  return await withSession(input.cfg, async (session) => {
    const matchPattern = scope === "project" ? `{ scope: $scope, projectId: $projectId }` : `{ scope: $scope }`;
    const res = await session.run(
      `
MATCH (n:Memory ${matchPattern})
WHERE toLower(n.key) CONTAINS toLower($q)
   OR toLower(n.value) CONTAINS toLower($q)
   OR any(t IN coalesce(n.tags, []) WHERE toLower(t) CONTAINS toLower($q))
RETURN n
ORDER BY n.updatedAt DESC
LIMIT toInteger($limit)
      `.trim(),
      {
        scope,
        ...(scope === "project" ? { projectId } : {}),
        q: input.query,
        limit,
      },
    );
    return res.records.map((r) => toNode(r as Record<MemoryRecordShape>));
  });
}

export async function recentMemory(input: {
  cfg: Neo4jConfig;
  scope: MemoryScope;
  projectId?: string;
  limit?: number;
  deps?: { withSession?: typeof withNeo4jSession };
}): Promise<MemoryNode[]> {
  const scope = input.scope;
  const projectId = requireProjectId(scope, input.projectId);
  const limit = Math.floor(Math.max(1, Math.min(50, input.limit ?? 10)));
  const withSession = input.deps?.withSession ?? withNeo4jSession;

  return await withSession(input.cfg, async (session) => {
    const matchPattern = scope === "project" ? `{ scope: $scope, projectId: $projectId }` : `{ scope: $scope }`;
    const res = await session.run(
      `
MATCH (n:Memory ${matchPattern})
RETURN n
ORDER BY n.updatedAt DESC
LIMIT toInteger($limit)
      `.trim(),
      {
        scope,
        ...(scope === "project" ? { projectId } : {}),
        limit,
      },
    );
    return res.records.map((r) => toNode(r as Record<MemoryRecordShape>));
  });
}

export type { MemoryNode, MemoryScope };
export { trimGlobalMessageProjects, trimMemoryByKeyPrefix } from "./graph/trim";
