import { existsSync } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { Skill, SkillSource } from "../types";
import { parseSkillFile } from "./parse";
import {
  getGlobalSkillsDir,
  getGlobalSubagentsDir,
  getProjectSkillsDirs,
  getProjectSubagentsDirs,
  resolveProjectDir,
} from "./paths";
import { validateSkillFrontmatter } from "./validate";

type SkillLocation = {
  id: string;
  filePath: string;
  source: SkillSource;
};

type SkillRoot = {
  root: string;
  source: SkillSource;
};

function getSkillRoots(projectDir?: string): SkillRoot[] {
  const roots: SkillRoot[] = [];
  const globalSkills = getGlobalSkillsDir();
  const globalSubagents = getGlobalSubagentsDir();
  const resolvedDir = resolveProjectDir(projectDir);

  if (resolvedDir) {
    const projectSkills = getProjectSkillsDirs(resolvedDir);
    const projectSubagents = getProjectSubagentsDirs(resolvedDir);
    for (const root of projectSkills) {
      roots.push({ root, source: { type: "project", path: root } });
    }
    for (const root of projectSubagents) {
      roots.push({ root, source: { type: "project", path: root } });
    }
  }

  roots.push({ root: globalSkills, source: { type: "global", path: globalSkills } });
  roots.push({ root: globalSubagents, source: { type: "global", path: globalSubagents } });

  return roots;
}

async function detectSkillDirs(root: string, source: SkillSource): Promise<SkillLocation[]> {
  if (!existsSync(root)) return [];
  const entries = await readdir(root, { withFileTypes: true });
  const locations: SkillLocation[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const filePath = join(root, entry.name, "SKILL.md");
    if (!existsSync(filePath)) continue;
    locations.push({ id: entry.name, filePath, source });
  }
  return locations;
}

async function loadSkillFile(location: SkillLocation): Promise<Skill> {
  const raw = await readFile(location.filePath, "utf8");
  const parsed = parseSkillFile(raw);
  const frontmatter = {
    ...(parsed.frontmatter as Record<string, unknown>),
    name: (parsed.frontmatter as Record<string, unknown>).name ?? location.id,
  } as Skill["frontmatter"];

  if (frontmatter.name !== location.id) {
    throw new Error(
      `Skill name "${frontmatter.name}" must match directory "${location.id}". ` +
        "Rename the folder or update frontmatter.name.",
    );
  }

  const validation = validateSkillFrontmatter(frontmatter);
  if (!validation.valid) {
    const details = validation.errors.map((err) => `${err.field}: ${err.message}`).join("; ");
    throw new Error(`Invalid skill "${location.id}": ${details}. Fix the fields in SKILL.md frontmatter.`);
  }

  const info = await stat(location.filePath);
  const root = dirname(location.filePath);

  return {
    id: location.id,
    source: location.source,
    frontmatter,
    systemPrompt: parsed.body,
    filePath: location.filePath,
    hasScripts: existsSync(join(root, "scripts")),
    hasReferences: existsSync(join(root, "references")),
    hasAssets: existsSync(join(root, "assets")),
    createdAt: info.birthtime,
    updatedAt: info.mtime,
  };
}

export async function loadSkill(id: string, projectDir?: string): Promise<Skill | undefined> {
  const roots = getSkillRoots(projectDir).slice().reverse();
  for (const root of roots) {
    const filePath = join(root.root, id, "SKILL.md");
    if (existsSync(filePath)) {
      return await loadSkillFile({ id, filePath, source: root.source });
    }
  }

  const { loadBuiltinSkills } = await import("./builtin");
  const builtins = loadBuiltinSkills();
  return builtins.get(id);
}

export async function loadSkillOverrides(projectDir?: string): Promise<Map<string, Skill>> {
  const skills = new Map<string, Skill>();
  const roots = getSkillRoots(projectDir);
  for (const root of roots) {
    const entries = await detectSkillDirs(root.root, root.source);
    for (const location of entries) {
      try {
        skills.set(location.id, await loadSkillFile(location));
      } catch {
        // Ignore invalid skills in listing.
      }
    }
  }

  return skills;
}

export async function loadAllSkills(projectDir?: string): Promise<Map<string, Skill>> {
  const { loadBuiltinSkills } = await import("./builtin");
  const skills = loadBuiltinSkills();
  const overrides = await loadSkillOverrides(projectDir);

  for (const [id, skill] of overrides) {
    skills.set(id, skill);
  }

  return skills;
}
