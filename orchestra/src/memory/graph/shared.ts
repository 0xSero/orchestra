import type { Node, Record } from "neo4j-driver";

export type MemoryScope = "global" | "project";

/**
 * Properties stored on a Memory node in Neo4j.
 */
export type MemoryNodeProperties = {
  scope: string;
  projectId?: string;
  key: string;
  value: string;
  tags?: string[];
  createdAt?: number;
  updatedAt?: number;
};

/**
 * The shape of a Neo4j record containing a Memory node under key "n".
 */
export type MemoryRecordShape = {
  n: Node<number, MemoryNodeProperties>;
};

export type MemoryNode = {
  scope: MemoryScope;
  projectId?: string;
  key: string;
  value: string;
  tags: string[];
  createdAt?: number;
  updatedAt?: number;
};

export function requireProjectId(scope: MemoryScope, projectId: string | undefined): string | undefined {
  if (scope !== "project") return undefined;
  if (!projectId) {
    throw new Error("projectId is required for project scope. Run inside a project or set OPENCODE_PROJECT_DIR.");
  }
  return projectId;
}

function normalizeTags(tags: unknown): string[] {
  if (!Array.isArray(tags)) return [];
  return tags
    .filter((t) => typeof t === "string")
    .map((t) => t.trim())
    .filter(Boolean);
}

/**
 * Convert a Neo4j Record containing a Memory node to a MemoryNode object.
 */
export function toNode(record: Record<MemoryRecordShape>): MemoryNode {
  const n = record.get("n");
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
