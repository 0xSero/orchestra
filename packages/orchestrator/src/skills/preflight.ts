import { readFile } from "node:fs/promises";
import { discoverSkills, type SkillEntry, type SkillSource } from "./discovery";
import { validateSkillDefinition } from "./validate";
import { loadOpenCodeConfig } from "../config/opencode";
import type { OrchestratorContext } from "../context/orchestrator-context";
import type { WorkflowDefinition } from "../workflows/types";
import type { WorkerProfile } from "../types";

export type SkillPermission = "allow" | "ask" | "deny";

export type SkillStatus =
  | "ok"
  | "missing"
  | "invalid"
  | "deny"
  | "ask"
  | "disabled";

export type SkillDescriptor = {
  name: string;
  source?: SkillSource;
  path?: string;
  status: SkillStatus;
  permission?: SkillPermission;
  description?: string;
  errors?: string[];
};

export type SkillPreflightResult = {
  ok: boolean;
  skills: SkillDescriptor[];
  errors: string[];
};

export type SkillRequirement = {
  name: string;
  workerId?: string;
  stepId?: string;
};

type Frontmatter = { name?: string; description?: string };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);

const isPermission = (value: unknown): value is SkillPermission =>
  value === "allow" || value === "ask" || value === "deny";

const matchPattern = (pattern: string, name: string): boolean => {
  if (pattern === "*") return true;
  if (!pattern.includes("*")) return pattern === name;
  const escaped = pattern
    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    .replace(/\\\*/g, ".*");
  return new RegExp(`^${escaped}$`).test(name);
};

const parseFrontmatter = (content: string): Frontmatter | undefined => {
  if (!content.startsWith("---")) return undefined;
  const end = content.indexOf("\n---", 3);
  if (end === -1) return undefined;
  const block = content.slice(3, end).trim();
  const out: Frontmatter = {};
  for (const line of block.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = trimmed.match(/^([a-zA-Z0-9_-]+)\s*:\s*(.*)$/);
    if (!match) continue;
    const key = match[1];
    const value = match[2].replace(/^"(.+)"$/, "$1").replace(/^'(.+)'$/, "$1");
    if (key === "name") out.name = value;
    if (key === "description") out.description = value;
  }
  return out;
};

const loadFrontmatter = async (
  entry: SkillEntry,
): Promise<Frontmatter | undefined> => {
  try {
    const content = await readFile(entry.skillPath, "utf8");
    return parseFrontmatter(content);
  } catch {
    return undefined;
  }
};

export async function loadSkillConfig(
  context: Pick<OrchestratorContext, "client" | "directory">,
): Promise<Record<string, unknown>> {
  if (context.client?.config?.get) {
    try {
      const res = await context.client.config.get({
        query: { directory: context.directory },
      } as any);
      if (res?.data && typeof res.data === "object")
        return res.data as Record<string, unknown>;
    } catch {
      // fall back to disk
    }
  }
  return await loadOpenCodeConfig();
}

export function resolveSkillPermissionMap(
  config: Record<string, unknown>,
  agentId?: string,
): Record<string, SkillPermission> | undefined {
  const globalRaw = (config as any)?.permission?.skill;
  const agentRaw = agentId
    ? (config as any)?.agent?.[agentId]?.permission?.skill
    : undefined;

  const toMap = (raw: unknown): Record<string, SkillPermission> => {
    if (!isRecord(raw)) return {};
    const entries: Record<string, SkillPermission> = {};
    for (const [key, value] of Object.entries(raw)) {
      if (isPermission(value)) entries[key] = value;
    }
    return entries;
  };

  const globalMap = toMap(globalRaw);
  const agentMap = toMap(agentRaw);
  const merged = { ...globalMap, ...agentMap };
  return Object.keys(merged).length > 0 ? merged : undefined;
}

export function resolveSkillToolEnabled(
  config: Record<string, unknown>,
  agentId?: string,
): boolean {
  const global = (config as any)?.tools?.skill;
  if (global === false) return false;
  const agent = agentId
    ? (config as any)?.agent?.[agentId]?.tools?.skill
    : undefined;
  if (agent === false) return false;
  return true;
}

export function resolveSkillPermission(
  name: string,
  map?: Record<string, SkillPermission>,
): SkillPermission {
  if (!map) return "allow";
  if (map[name]) return map[name];
  const matches = Object.keys(map)
    .filter((pattern) => matchPattern(pattern, name))
    .sort((a, b) => b.length - a.length);
  if (matches.length === 0) return "allow";
  return map[matches[0]];
}

export async function listSkills(input: {
  directory: string;
  worktree?: string;
  includeGlobal?: boolean;
  xdgConfigHome?: string;
  homeDir?: string;
}): Promise<SkillDescriptor[]> {
  const entries = await discoverSkills({
    directory: input.directory,
    worktree: input.worktree,
    includeGlobal: input.includeGlobal,
    xdgConfigHome: input.xdgConfigHome,
    homeDir: input.homeDir,
  });

  const results: SkillDescriptor[] = [];
  for (const entry of entries) {
    const frontmatter = await loadFrontmatter(entry);
    const errors: string[] = [];
    if (!frontmatter) errors.push("missing frontmatter");
    const declaredName = frontmatter?.name ?? entry.name;
    const description = frontmatter?.description;
    const validation = validateSkillDefinition({
      name: declaredName,
      description: description ?? "",
      directoryName: entry.name,
    });
    if (!validation.ok) errors.push(...validation.errors);

    results.push({
      name: entry.name,
      source: entry.source,
      path: entry.skillPath,
      status: errors.length === 0 ? "ok" : "invalid",
      description,
      errors: errors.length > 0 ? errors : undefined,
    });
  }
  return results;
}

export async function validateSkills(input: {
  requiredSkills: string[];
  directory: string;
  worktree?: string;
  includeGlobal?: boolean;
  permissionMap?: Record<string, SkillPermission>;
  toolEnabled?: boolean;
}): Promise<SkillPreflightResult> {
  const required = [...new Set(input.requiredSkills)].filter(Boolean);
  if (required.length === 0) {
    return { ok: true, skills: [], errors: [] };
  }

  const discovered = await listSkills({
    directory: input.directory,
    worktree: input.worktree,
    includeGlobal: input.includeGlobal,
  });
  const byName = new Map<string, SkillDescriptor>();
  for (const entry of discovered) {
    if (!byName.has(entry.name)) byName.set(entry.name, entry);
  }

  const skills: SkillDescriptor[] = [];
  const errors: string[] = [];
  const toolEnabled = input.toolEnabled ?? true;

  for (const name of required) {
    const permission = resolveSkillPermission(name, input.permissionMap);
    if (!toolEnabled) {
      skills.push({ name, status: "disabled", permission });
      errors.push(`skill tool disabled for "${name}"`);
      continue;
    }

    const entry = byName.get(name);
    if (!entry) {
      skills.push({ name, status: "missing", permission });
      errors.push(`missing skill "${name}"`);
      continue;
    }

    if (entry.status === "invalid") {
      skills.push({ ...entry, status: "invalid", permission });
      errors.push(`invalid skill "${name}"`);
      continue;
    }

    if (permission === "deny") {
      skills.push({ ...entry, status: "deny", permission });
      errors.push(`permission denied for "${name}"`);
      continue;
    }

    skills.push({
      ...entry,
      status: permission === "ask" ? "ask" : "ok",
      permission,
    });
  }

  return { ok: errors.length === 0, skills, errors };
}

export function collectWorkflowSkillRequirements(
  workflow: WorkflowDefinition,
  profiles: Record<string, WorkerProfile>,
): SkillRequirement[] {
  const requirements: SkillRequirement[] = [];
  for (const step of workflow.steps) {
    const workerProfile = profiles[step.workerId];
    const workerSkills = workerProfile?.requiredSkills ?? [];
    for (const name of workerSkills) {
      requirements.push({ name, workerId: step.workerId, stepId: step.id });
    }
    const stepSkills = step.requiredSkills ?? [];
    for (const name of stepSkills) {
      requirements.push({ name, workerId: step.workerId, stepId: step.id });
    }
  }
  return requirements;
}
