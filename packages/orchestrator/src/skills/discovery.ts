import { existsSync, type Dirent } from "node:fs";
import { readdir } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { homedir } from "node:os";

export type SkillSource =
  | "project"
  | "project-claude"
  | "global"
  | "global-claude";

export type SkillSearchRoot = {
  root: string;
  source: SkillSource;
  parent: string;
};

export type SkillEntry = {
  name: string;
  skillDir: string;
  skillPath: string;
  source: SkillSource;
  root: string;
};

export type SkillDiscoveryOptions = {
  directory: string;
  worktree?: string;
  xdgConfigHome?: string;
  homeDir?: string;
  includeGlobal?: boolean;
};

const isWithin = (child: string, parent: string): boolean => {
  const rel = relative(parent, child);
  if (!rel) return true;
  return !rel.startsWith(`..${sep}`) && rel !== ".." && !rel.startsWith("../");
};

const walkUp = (start: string, stop: string): string[] => {
  const paths: string[] = [];
  let current = start;
  while (true) {
    paths.push(current);
    if (current === stop) break;
    const next = dirname(current);
    if (next === current) break;
    current = next;
  }
  return paths;
};

export const getSkillSearchRoots = (
  options: SkillDiscoveryOptions,
): SkillSearchRoot[] => {
  const directory = resolve(options.directory);
  const worktree = resolve(options.worktree ?? options.directory);
  const stop = isWithin(directory, worktree) ? worktree : directory;
  const roots: SkillSearchRoot[] = [];

  for (const current of walkUp(directory, stop)) {
    roots.push({
      root: join(current, ".opencode", "skill"),
      source: "project",
      parent: current,
    });
    roots.push({
      root: join(current, ".claude", "skills"),
      source: "project-claude",
      parent: current,
    });
  }

  if (options.includeGlobal !== false) {
    const configHome =
      options.xdgConfigHome ??
      process.env.XDG_CONFIG_HOME ??
      join(homedir(), ".config");
    const home = options.homeDir ?? process.env.HOME ?? homedir();
    roots.push({
      root: join(configHome, "opencode", "skill"),
      source: "global",
      parent: configHome,
    });
    roots.push({
      root: join(home, ".claude", "skills"),
      source: "global-claude",
      parent: home,
    });
  }

  return roots;
};

export const discoverSkills = async (
  options: SkillDiscoveryOptions,
): Promise<SkillEntry[]> => {
  const roots = getSkillSearchRoots(options);
  const entries: SkillEntry[] = [];

  for (const root of roots) {
    let dirents: Dirent[];
    try {
      dirents = await readdir(root.root, {
        withFileTypes: true,
        encoding: "utf8",
      });
    } catch {
      continue;
    }

    for (const dirent of dirents) {
      if (!dirent.isDirectory()) continue;
      const skillDir = join(root.root, dirent.name);
      const skillPath = join(skillDir, "SKILL.md");
      if (!existsSync(skillPath)) continue;
      entries.push({
        name: dirent.name,
        skillDir,
        skillPath,
        source: root.source,
        root: root.root,
      });
    }
  }

  return entries;
};
