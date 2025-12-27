import type { Neo4jConfig } from "../neo4j";
import { withNeo4jSession } from "../neo4j";
import type { MemoryScope } from "./shared";
import { requireProjectId } from "./shared";

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
      const matchPattern = scope === "project" ? `{ scope: $scope, projectId: $projectId }` : `{ scope: $scope }`;
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
    const matchPattern = scope === "project" ? `{ scope: $scope, projectId: $projectId }` : `{ scope: $scope }`;
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
