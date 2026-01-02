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

function requireProjectId(
  scope: MemoryScope,
  projectId: string | undefined,
): string | undefined {
  if (scope !== "project") return undefined;
  if (!projectId) throw new Error("projectId is required for project scope");
  return projectId;
}

function normalizeTags(tags: unknown): string[] {
  if (!Array.isArray(tags)) return [];
  return tags
    .filter((t) => typeof t === "string")
    .map((t) => t.trim())
    .filter(Boolean);
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
  const projectId = requireProjectId(scope, input.projectId);

  return await withNeo4jSession(input.cfg, async (session) => {
    const mergePattern =
      scope === "project"
        ? `{ scope: $scope, projectId: $projectId, key: $key }`
        : `{ scope: $scope, key: $key }`;
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
  const projectId = requireProjectId(scope, input.projectId);
  const type = input.type ?? "relates_to";

  await withNeo4jSession(input.cfg, async (session) => {
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
}): Promise<MemoryNode | undefined> {
  const scope = input.scope;
  const projectId = requireProjectId(scope, input.projectId);

  return await withNeo4jSession(input.cfg, async (session) => {
    const matchPattern =
      scope === "project"
        ? `{ scope: $scope, projectId: $projectId, key: $key }`
        : `{ scope: $scope, key: $key }`;
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
    const rec = res.records?.[0];
    if (!rec) return undefined;
    return toNode(rec as any);
  });
}

export async function searchMemory(input: {
  cfg: Neo4jConfig;
  scope: MemoryScope;
  projectId?: string;
  query: string;
  limit?: number;
}): Promise<MemoryNode[]> {
  const scope = input.scope;
  const projectId = requireProjectId(scope, input.projectId);
  const limit = Math.floor(Math.max(1, Math.min(50, input.limit ?? 10)));

  return await withNeo4jSession(input.cfg, async (session) => {
    const matchPattern =
      scope === "project"
        ? `{ scope: $scope, projectId: $projectId }`
        : `{ scope: $scope }`;
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
  const projectId = requireProjectId(scope, input.projectId);
  const limit = Math.floor(Math.max(1, Math.min(50, input.limit ?? 10)));

  return await withNeo4jSession(input.cfg, async (session) => {
    const matchPattern =
      scope === "project"
        ? `{ scope: $scope, projectId: $projectId }`
        : `{ scope: $scope }`;
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
    return res.records.map((r) => toNode(r as any));
  });
}

export async function trimMemoryByKeyPrefix(input: {
  cfg: Neo4jConfig;
  scope: MemoryScope;
  projectId?: string;
  keyPrefix: string;
  keepLatest: number;
}): Promise<{ deleted: number }> {
  const scope = input.scope;
  const projectId = requireProjectId(scope, input.projectId);
  const keepLatest = Math.max(0, Math.floor(input.keepLatest));

  if (keepLatest === 0) {
    const deleted = await withNeo4jSession(input.cfg, async (session) => {
      const matchPattern =
        scope === "project"
          ? `{ scope: $scope, projectId: $projectId }`
          : `{ scope: $scope }`;
      const res = await session.run(
        `
MATCH (n:Memory ${matchPattern})
WHERE n.key STARTS WITH $prefix
WITH collect(n) AS nodes
FOREACH (x IN nodes | DETACH DELETE x)
RETURN size(nodes) AS deleted
        `.trim(),
        {
          scope,
          ...(scope === "project" ? { projectId } : {}),
          prefix: input.keyPrefix,
        },
      );
      const rec = res.records?.[0] as any;
      return rec ? (rec.get("deleted") as number) : 0;
    });
    return { deleted };
  }

  const deleted = await withNeo4jSession(input.cfg, async (session) => {
    const matchPattern =
      scope === "project"
        ? `{ scope: $scope, projectId: $projectId }`
        : `{ scope: $scope }`;
    const res = await session.run(
      `
MATCH (n:Memory ${matchPattern})
WHERE n.key STARTS WITH $prefix
WITH n ORDER BY n.updatedAt DESC
WITH collect(n) AS nodes
WITH nodes[toInteger($keepLatest)..] AS toDelete
FOREACH (x IN toDelete | DETACH DELETE x)
RETURN size(toDelete) AS deleted
      `.trim(),
      {
        scope,
        ...(scope === "project" ? { projectId } : {}),
        prefix: input.keyPrefix,
        keepLatest,
      },
    );
    const rec = res.records?.[0] as any;
    return rec ? (rec.get("deleted") as number) : 0;
  });

  return { deleted };
}

export async function trimGlobalMessageProjects(input: {
  cfg: Neo4jConfig;
  keepProjects: number;
}): Promise<{ projectsDropped: number; messagesDeleted: number }> {
  const keepProjects = Math.max(0, Math.floor(input.keepProjects));
  if (keepProjects <= 0) {
    const { deleted } = await trimMemoryByKeyPrefix({
      cfg: input.cfg,
      scope: "global",
      keyPrefix: "message:",
      keepLatest: 0,
    });
    return { projectsDropped: 0, messagesDeleted: deleted };
  }

  return await withNeo4jSession(input.cfg, async (session) => {
    const res = await session.run(
      `
MATCH (n:Memory { scope: $scope })
WHERE n.key STARTS WITH $prefix
WITH split(n.key, ':')[1] AS projectId, max(n.updatedAt) AS lastUpdated
ORDER BY lastUpdated DESC
WITH collect(projectId) AS projects
WITH projects[toInteger($keepProjects)..] AS toDrop
MATCH (m:Memory { scope: $scope })
WHERE m.key STARTS WITH $prefix AND split(m.key, ':')[1] IN toDrop
WITH toDrop, collect(m) AS toDelete
FOREACH (x IN toDelete | DETACH DELETE x)
RETURN size(toDrop) AS projectsDropped, size(toDelete) AS messagesDeleted
      `.trim(),
      { keepProjects, scope: "global", prefix: "message:" },
    );
    const rec = res.records?.[0] as any;
    return {
      projectsDropped: rec ? (rec.get("projectsDropped") as number) : 0,
      messagesDeleted: rec ? (rec.get("messagesDeleted") as number) : 0,
    };
  });
}
