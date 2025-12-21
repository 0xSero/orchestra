import type { RecordShape } from "neo4j-driver";
import type { Neo4jConfig } from "./neo4j";
import { withNeo4jSession } from "./neo4j";

export type MemoryScope = "global" | "project";

export type MemoryNode = {
  scope: MemoryScope;
  projectId?: string;
  key: string;
  value: string;
  tags: string[];
  createdAt?: number;
  updatedAt?: number;
};

function normalizeTags(tags: unknown): string[] {
  if (!Array.isArray(tags)) return [];
  return tags.filter((t) => typeof t === "string").map((t) => t.trim()).filter(Boolean);
}

function toNode(record: RecordShape): MemoryNode {
  const n = (record as any).get("n");
  const p = n?.properties ?? {};
  return {
    scope: (p.scope as MemoryScope) ?? "project",
    projectId: typeof p.projectId === "string" ? p.projectId : undefined,
    key: String(p.key ?? ""),
    value: String(p.value ?? ""),
    tags: normalizeTags(p.tags),
    createdAt: typeof p.createdAt === "number" ? p.createdAt : undefined,
    updatedAt: typeof p.updatedAt === "number" ? p.updatedAt : undefined,
  };
}

export async function upsertMemory(input: {
  cfg: Neo4jConfig;
  scope: MemoryScope;
  projectId?: string;
  key: string;
  value: string;
  tags?: string[];
}): Promise<MemoryNode> {
  const scope = input.scope;
  const projectId = scope === "project" ? input.projectId : undefined;
  if (scope === "project" && !projectId) throw new Error("projectId is required for project scope");

  return await withNeo4jSession(input.cfg, async (session) => {
    const res = await session.run(
      `
MERGE (n:Memory { scope: $scope, projectId: $projectId, key: $key })
ON CREATE SET n.createdAt = timestamp()
SET n.value = $value,
    n.tags = $tags,
    n.updatedAt = timestamp()
RETURN n
      `.trim(),
      {
        scope,
        projectId: projectId ?? null,
        key: input.key,
        value: input.value,
        tags: input.tags ?? [],
      }
    );
    const rec = res.records?.[0];
    if (!rec) throw new Error("No record returned from Neo4j");
    return toNode(rec as any);
  });
}

export async function linkMemory(input: {
  cfg: Neo4jConfig;
  scope: MemoryScope;
  projectId?: string;
  fromKey: string;
  toKey: string;
  type?: string;
}): Promise<{ ok: true }> {
  const scope = input.scope;
  const projectId = scope === "project" ? input.projectId : undefined;
  if (scope === "project" && !projectId) throw new Error("projectId is required for project scope");
  const type = input.type ?? "relates_to";

  await withNeo4jSession(input.cfg, async (session) => {
    await session.run(
      `
MATCH (a:Memory { scope: $scope, projectId: $projectId, key: $fromKey })
MATCH (b:Memory { scope: $scope, projectId: $projectId, key: $toKey })
MERGE (a)-[r:RELATES_TO { type: $type }]->(b)
SET r.updatedAt = timestamp()
RETURN r
      `.trim(),
      {
        scope,
        projectId: projectId ?? null,
        fromKey: input.fromKey,
        toKey: input.toKey,
        type,
      }
    );
  });

  return { ok: true };
}

export async function searchMemory(input: {
  cfg: Neo4jConfig;
  scope: MemoryScope;
  projectId?: string;
  query: string;
  limit?: number;
}): Promise<MemoryNode[]> {
  const scope = input.scope;
  const projectId = scope === "project" ? input.projectId : undefined;
  if (scope === "project" && !projectId) throw new Error("projectId is required for project scope");
  const limit = Math.floor(Math.max(1, Math.min(50, input.limit ?? 10)));

  return await withNeo4jSession(input.cfg, async (session) => {
    const res = await session.run(
      `
MATCH (n:Memory { scope: $scope, projectId: $projectId })
WHERE toLower(n.key) CONTAINS toLower($q)
   OR toLower(n.value) CONTAINS toLower($q)
   OR any(t IN coalesce(n.tags, []) WHERE toLower(t) CONTAINS toLower($q))
RETURN n
ORDER BY n.updatedAt DESC
LIMIT toInteger($limit)
      `.trim(),
      {
        scope,
        projectId: projectId ?? null,
        q: input.query,
        limit,
      }
    );
    return res.records.map((r) => toNode(r as any));
  });
}

export async function recentMemory(input: {
  cfg: Neo4jConfig;
  scope: MemoryScope;
  projectId?: string;
  limit?: number;
}): Promise<MemoryNode[]> {
  const scope = input.scope;
  const projectId = scope === "project" ? input.projectId : undefined;
  if (scope === "project" && !projectId) throw new Error("projectId is required for project scope");
  const limit = Math.floor(Math.max(1, Math.min(50, input.limit ?? 10)));

  return await withNeo4jSession(input.cfg, async (session) => {
    const res = await session.run(
      `
MATCH (n:Memory { scope: $scope, projectId: $projectId })
RETURN n
ORDER BY n.updatedAt DESC
LIMIT toInteger($limit)
      `.trim(),
      {
        scope,
        projectId: projectId ?? null,
        limit,
      }
    );
    return res.records.map((r) => toNode(r as any));
  });
}
