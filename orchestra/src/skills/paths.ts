import { homedir } from "node:os";
import { join } from "node:path";
import type { SkillScope } from "../types";

// Subagents are stored in .opencode/agent/subagents/
// Each subagent is a directory with a SKILL.md file defining its profile
const SUBAGENT_DIR_PATH = ["agent", "subagents"];

export function getProjectSkillsDir(projectDir: string): string {
  return join(projectDir, ".opencode", ...SUBAGENT_DIR_PATH);
}

export function getGlobalSkillsDir(): string {
  const home = process.env.OPENCODE_SKILLS_HOME ?? homedir();
  return join(home, ".opencode", ...SUBAGENT_DIR_PATH);
}

export function getSkillDir(id: string, scope: SkillScope, projectDir?: string): string {
  if (scope === "global") return join(getGlobalSkillsDir(), id);
  if (!projectDir) throw new Error("Project directory is required for project-scoped skills.");
  return join(getProjectSkillsDir(projectDir), id);
}

export function getSkillFilePath(id: string, scope: SkillScope, projectDir?: string): string {
  return join(getSkillDir(id, scope, projectDir), "SKILL.md");
}
