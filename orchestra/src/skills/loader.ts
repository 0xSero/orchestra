import { existsSync } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { Skill } from "../types";
import type { SkillSource } from "../types";
import { parseSkillFile } from "./parse";
import { validateSkillFrontmatter } from "./validate";
import { getGlobalSkillsDir, getProjectSkillsDir } from "./paths";

type SkillLocation = {
  id: string;
  filePath: string;
  source: SkillSource;
};

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
    throw new Error(`Skill name "${frontmatter.name}" must match directory "${location.id}".`);
  }

  const validation = validateSkillFrontmatter(frontmatter);
  if (!validation.valid) {
    const details = validation.errors.map((err) => `${err.field}: ${err.message}`).join("; ");
    throw new Error(`Invalid skill "${location.id}": ${details}`);
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
  const projectRoot = projectDir ? getProjectSkillsDir(projectDir) : undefined;
  const globalRoot = getGlobalSkillsDir();

  const locations: SkillLocation[] = [];
  if (projectRoot) {
    const filePath = join(projectRoot, id, "SKILL.md");
    if (existsSync(filePath)) locations.push({ id, filePath, source: { type: "project", path: projectRoot } });
  }

  const globalPath = join(globalRoot, id, "SKILL.md");
  if (existsSync(globalPath)) locations.push({ id, filePath: globalPath, source: { type: "global", path: globalRoot } });

  if (locations.length > 0) {
    return await loadSkillFile(locations[0]);
  }

  const { loadBuiltinSkills } = await import("./builtin");
  const builtins = loadBuiltinSkills();
  return builtins.get(id);
}

export async function loadSkillOverrides(projectDir?: string): Promise<Map<string, Skill>> {
  const skills = new Map<string, Skill>();
  const globalRoot = getGlobalSkillsDir();
  const projectRoot = projectDir ? getProjectSkillsDir(projectDir) : undefined;

  const globalSkills = await detectSkillDirs(globalRoot, { type: "global", path: globalRoot });
  for (const location of globalSkills) {
    try {
      skills.set(location.id, await loadSkillFile(location));
    } catch {
      // Ignore invalid skills in listing.
    }
  }

  if (projectRoot) {
    const projectSkills = await detectSkillDirs(projectRoot, { type: "project", path: projectRoot });
    for (const location of projectSkills) {
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
