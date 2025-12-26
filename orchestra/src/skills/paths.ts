import { homedir } from "node:os";
import { join } from "node:path";
import type { SkillScope } from "../types";

const SKILL_DIR_NAME = "skill";

export function getProjectSkillsDir(projectDir: string): string {
  return join(projectDir, ".opencode", SKILL_DIR_NAME);
}

export function getGlobalSkillsDir(): string {
  const home = process.env.OPENCODE_SKILLS_HOME ?? homedir();
  return join(home, ".opencode", SKILL_DIR_NAME);
}

export function getSkillDir(id: string, scope: SkillScope, projectDir?: string): string {
  if (scope === "global") return join(getGlobalSkillsDir(), id);
  if (!projectDir) throw new Error("Project directory is required for project-scoped skills.");
  return join(getProjectSkillsDir(projectDir), id);
}

export function getSkillFilePath(id: string, scope: SkillScope, projectDir?: string): string {
  return join(getSkillDir(id, scope, projectDir), "SKILL.md");
}
