import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { getUserConfigDir } from "../helpers/format";
import { writeJsonAtomic } from "../helpers/fs";
import type { MemoryNode, MemoryScope } from "./graph";

type MemoryLink = {
  fromKey: string;
  toKey: string;
  type: string;
  createdAt: number;
  updatedAt: number;
};

type MemoryFile = {
  version: 1;
  updatedAt: number;
  nodes: MemoryNode[];
  links: MemoryLink[];
};

function requireProjectId(scope: MemoryScope, projectId: string | undefined): string | undefined {
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

function safeProjectId(projectId: string): string {
  return encodeURIComponent(projectId);
}

function getMemoryFilePath(scope: MemoryScope, projectId: string | undefined): string {
  const base = join(getUserConfigDir(), "opencode", "orchestrator-memory");
  if (scope === "global") {
    return join(base, "global.json");
  }
  const safe = safeProjectId(requireProjectId(scope, projectId) ?? "unknown");
  return join(base, "projects", `${safe}.json`);
}

async function readMemoryFile(path: string): Promise<MemoryFile> {
  if (!existsSync(path)) {
    return { version: 1, updatedAt: Date.now(), nodes: [], links: [] };
  }
  try {
    const raw = JSON.parse(await readFile(path, "utf8")) as Partial<MemoryFile>;
    const nodes = Array.isArray(raw.nodes) ? (raw.nodes as MemoryNode[]) : [];
    const links = Array.isArray(raw.links) ? (raw.links as MemoryLink[]) : [];
    return {
      version: 1,
      updatedAt: typeof raw.updatedAt === "number" ? raw.updatedAt : Date.now(),
      nodes,
      links,
    };
  } catch {
    return { version: 1, updatedAt: Date.now(), nodes: [], links: [] };
  }
}

async function writeMemoryFile(path: string, file: MemoryFile): Promise<void> {
  await writeJsonAtomic(path, file, { tmpPrefix: "opencode-orch-memory" });
}

export async function upsertMemory(input: {
  scope: MemoryScope;
  projectId?: string;
  key: string;
  value: string;
  tags?: string[];
}): Promise<MemoryNode> {
  const scope = input.scope;
  const projectId = requireProjectId(scope, input.projectId);
  const path = getMemoryFilePath(scope, projectId);
  const file = await readMemoryFile(path);
  const now = Date.now();

  const idx = file.nodes.findIndex((n) => n.key === input.key);
  const next: MemoryNode = {
    scope,
    ...(scope === "project" ? { projectId } : {}),
    key: input.key,
    value: input.value,
    tags: normalizeTags(input.tags),
    createdAt: idx >= 0 ? file.nodes[idx].createdAt : now,
    updatedAt: now,
  };

  if (idx >= 0) file.nodes[idx] = next;
  else file.nodes.push(next);

  file.updatedAt = now;
  await writeMemoryFile(path, file);
  return next;
}

export async function linkMemory(input: {
  scope: MemoryScope;
  projectId?: string;
  fromKey: string;
  toKey: string;
  type?: string;
}): Promise<{ ok: true }> {
  const scope = input.scope;
  const projectId = requireProjectId(scope, input.projectId);
  const path = getMemoryFilePath(scope, projectId);
  const file = await readMemoryFile(path);
  const now = Date.now();
  const type = input.type ?? "relates_to";

  const idx = file.links.findIndex((l) => l.fromKey === input.fromKey && l.toKey === input.toKey && l.type === type);
  if (idx >= 0) {
    file.links[idx].updatedAt = now;
  } else {
    file.links.push({
      fromKey: input.fromKey,
      toKey: input.toKey,
      type,
      createdAt: now,
      updatedAt: now,
    });
  }

  file.updatedAt = now;
  await writeMemoryFile(path, file);
  return { ok: true };
}

export async function getMemoryByKey(input: {
  scope: MemoryScope;
  projectId?: string;
  key: string;
}): Promise<MemoryNode | undefined> {
  const scope = input.scope;
  const projectId = requireProjectId(scope, input.projectId);
  const path = getMemoryFilePath(scope, projectId);
  const file = await readMemoryFile(path);
  return file.nodes.find((n) => n.key === input.key);
}

export async function searchMemory(input: {
  scope: MemoryScope;
  projectId?: string;
  query: string;
  limit?: number;
}): Promise<MemoryNode[]> {
  const scope = input.scope;
  const projectId = requireProjectId(scope, input.projectId);
  const path = getMemoryFilePath(scope, projectId);
  const file = await readMemoryFile(path);
  const limit = Math.floor(Math.max(1, Math.min(50, input.limit ?? 10)));
  const q = input.query.toLowerCase();

  return file.nodes
    .filter((n) => {
      if (n.key.toLowerCase().includes(q)) return true;
      if (n.value.toLowerCase().includes(q)) return true;
      return n.tags.some((t) => t.toLowerCase().includes(q));
    })
    .sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))
    .slice(0, limit);
}

export async function recentMemory(input: {
  scope: MemoryScope;
  projectId?: string;
  limit?: number;
}): Promise<MemoryNode[]> {
  const scope = input.scope;
  const projectId = requireProjectId(scope, input.projectId);
  const path = getMemoryFilePath(scope, projectId);
  const file = await readMemoryFile(path);
  const limit = Math.floor(Math.max(1, Math.min(50, input.limit ?? 10)));

  return file.nodes
    .slice()
    .sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))
    .slice(0, limit);
}

export async function trimMemoryByKeyPrefix(input: {
  scope: MemoryScope;
  projectId?: string;
  keyPrefix: string;
  keepLatest: number;
}): Promise<{ deleted: number }> {
  const scope = input.scope;
  const projectId = requireProjectId(scope, input.projectId);
  const path = getMemoryFilePath(scope, projectId);
  const file = await readMemoryFile(path);
  const keepLatest = Math.max(0, Math.floor(input.keepLatest));

  const matches = file.nodes.filter((n) => n.key.startsWith(input.keyPrefix));
  if (matches.length === 0) return { deleted: 0 };

  let keep = new Set<string>();
  if (keepLatest > 0) {
    const sorted = matches.slice().sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
    keep = new Set(sorted.slice(0, keepLatest).map((n) => n.key));
  }

  const before = file.nodes.length;
  file.nodes = file.nodes.filter((n) => !n.key.startsWith(input.keyPrefix) || keep.has(n.key));
  const deleted = before - file.nodes.length;
  if (deleted > 0) {
    file.updatedAt = Date.now();
    await writeMemoryFile(path, file);
  }
  return { deleted };
}

export async function trimGlobalMessageProjects(input: {
  keepProjects: number;
}): Promise<{ projectsDropped: number; messagesDeleted: number }> {
  const keepProjects = Math.max(0, Math.floor(input.keepProjects));
  const path = getMemoryFilePath("global", undefined);
  const file = await readMemoryFile(path);

  const messageNodes = file.nodes.filter((n) => n.key.startsWith("message:"));
  if (messageNodes.length === 0) return { projectsDropped: 0, messagesDeleted: 0 };

  if (keepProjects <= 0) {
    const before = file.nodes.length;
    file.nodes = file.nodes.filter((n) => !n.key.startsWith("message:"));
    const deleted = before - file.nodes.length;
    if (deleted > 0) {
      file.updatedAt = Date.now();
      await writeMemoryFile(path, file);
    }
    return { projectsDropped: 0, messagesDeleted: deleted };
  }

  const projectLastUpdated = new Map<string, number>();
  for (const node of messageNodes) {
    const parts = node.key.split(":");
    const projectId = parts.length > 1 ? parts[1] : "unknown";
    const updated = node.updatedAt ?? 0;
    const prev = projectLastUpdated.get(projectId) ?? 0;
    if (updated > prev) projectLastUpdated.set(projectId, updated);
  }

  const ordered = [...projectLastUpdated.entries()].sort((a, b) => b[1] - a[1]);
  const drop = new Set(ordered.slice(keepProjects).map(([id]) => id));

  if (drop.size === 0) return { projectsDropped: 0, messagesDeleted: 0 };

  const before = file.nodes.length;
  file.nodes = file.nodes.filter((n) => {
    if (!n.key.startsWith("message:")) return true;
    const parts = n.key.split(":");
    const projectId = parts.length > 1 ? parts[1] : "unknown";
    return !drop.has(projectId);
  });
  const deleted = before - file.nodes.length;
  if (deleted > 0) {
    file.updatedAt = Date.now();
    await writeMemoryFile(path, file);
  }
  return { projectsDropped: drop.size, messagesDeleted: deleted };
}
