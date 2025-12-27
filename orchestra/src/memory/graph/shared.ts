import type { RecordShape } from "neo4j-driver";

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

export function requireProjectId(scope: MemoryScope, projectId: string | undefined): string | undefined {
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

export function toNode(record: RecordShape): MemoryNode {
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
