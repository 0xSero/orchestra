import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { SkillScope } from "../types";

// Skills are stored in .opencode/skill/
// Subagents are stored in .opencode/agent/subagents/
// Both are treated as skill sources.
const SKILL_DIR_PATH = ["skill"];
const SUBAGENT_DIR_PATH = ["agent", "subagents"];
const ORCHESTRA_DIR = "orchestra";
const SKILL_DIR_MARKERS = [
  [".opencode", ...SKILL_DIR_PATH],
  [".opencode", ...SUBAGENT_DIR_PATH],
  [ORCHESTRA_DIR, ".opencode", ...SKILL_DIR_PATH],
  [ORCHESTRA_DIR, ".opencode", ...SUBAGENT_DIR_PATH],
];

const MODULE_ROOT = (() => {
  const moduleDir = dirname(fileURLToPath(import.meta.url));
  return dirname(dirname(moduleDir));
})();

function uniquePaths(paths: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const path of paths) {
    if (seen.has(path)) continue;
    seen.add(path);
    result.push(path);
  }
  return result;
}

export function hasProjectSkillDirs(projectDir: string): boolean {
  return SKILL_DIR_MARKERS.some((parts) => existsSync(join(projectDir, ...parts)));
}

export function inferProjectDir(startDir: string = process.cwd()): string | undefined {
  let current = startDir;
  while (true) {
    if (hasProjectSkillDirs(current)) return current;
    const parent = dirname(current);
    if (parent === current) return undefined;
    current = parent;
  }
}

export function resolveProjectDir(projectDir?: string): string | undefined {
  const explicitDir =
    projectDir ?? process.env.OPENCODE_PROJECT_DIR ?? process.env.OPENCODE_WORKDIR ?? process.env.OPENCODE_WORKTREE;
  if (explicitDir) {
    if (hasProjectSkillDirs(explicitDir)) return explicitDir;
    return inferProjectDir(explicitDir) ?? explicitDir;
  }
  if (hasProjectSkillDirs(MODULE_ROOT)) return MODULE_ROOT;
  const inferred = inferProjectDir();
  return inferred;
}

export function getProjectSkillsDir(projectDir: string): string {
  const candidates = getProjectSkillsDirs(projectDir);
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  return candidates[0];
}

export function getGlobalSkillsDir(): string {
  const home = process.env.OPENCODE_SKILLS_HOME ?? homedir();
  return join(home, ".opencode", ...SKILL_DIR_PATH);
}

export function getProjectSkillsDirs(projectDir: string): string[] {
  return uniquePaths([
    join(projectDir, ".opencode", ...SKILL_DIR_PATH),
    join(projectDir, ORCHESTRA_DIR, ".opencode", ...SKILL_DIR_PATH),
  ]);
}

export function getProjectSubagentsDir(projectDir: string): string {
  const candidates = getProjectSubagentsDirs(projectDir);
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  return candidates[0];
}

export function getGlobalSubagentsDir(): string {
  const home = process.env.OPENCODE_SKILLS_HOME ?? homedir();
  return join(home, ".opencode", ...SUBAGENT_DIR_PATH);
}

export function getProjectSubagentsDirs(projectDir: string): string[] {
  return uniquePaths([
    join(projectDir, ".opencode", ...SUBAGENT_DIR_PATH),
    join(projectDir, ORCHESTRA_DIR, ".opencode", ...SUBAGENT_DIR_PATH),
  ]);
}

export function getSkillDir(id: string, scope: SkillScope, projectDir?: string): string {
  if (scope === "global") return join(getGlobalSkillsDir(), id);
  if (!projectDir) throw new Error("Project directory is required for project-scoped skills.");
  return join(getProjectSkillsDir(projectDir), id);
}

export function getSubagentDir(id: string, scope: SkillScope, projectDir?: string): string {
  if (scope === "global") return join(getGlobalSubagentsDir(), id);
  if (!projectDir) throw new Error("Project directory is required for project-scoped skills.");
  return join(getProjectSubagentsDir(projectDir), id);
}

export function getSkillFilePath(id: string, scope: SkillScope, projectDir?: string): string {
  return join(getSkillDir(id, scope, projectDir), "SKILL.md");
}

export function getSubagentFilePath(id: string, scope: SkillScope, projectDir?: string): string {
  return join(getSubagentDir(id, scope, projectDir), "SKILL.md");
}
