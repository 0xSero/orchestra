import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  discoverSkills,
  getSkillSearchRoots,
} from "../../src/skills/discovery";

describe("skills discovery", () => {
  let tmpDir: string;
  let projectDir: string;
  let nestedDir: string;
  let configHome: string;
  let homeDir: string;

  beforeAll(async () => {
    tmpDir = await mkdtemp(join(process.cwd(), ".tmp", "skills-discovery-"));
    projectDir = join(tmpDir, "repo");
    nestedDir = join(projectDir, "src");
    configHome = join(tmpDir, "config");
    homeDir = join(tmpDir, "home");
    await Promise.all([
      mkdir(nestedDir, { recursive: true }),
      mkdir(configHome, { recursive: true }),
      mkdir(homeDir, { recursive: true }),
    ]);
  });

  afterAll(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  test("computes deterministic search roots", () => {
    const roots = getSkillSearchRoots({
      directory: nestedDir,
      worktree: projectDir,
      xdgConfigHome: configHome,
      homeDir,
    });

    expect(roots[0].root).toBe(join(nestedDir, ".opencode", "skill"));
    expect(roots[1].root).toBe(join(nestedDir, ".claude", "skills"));
    expect(roots[2].root).toBe(join(projectDir, ".opencode", "skill"));
    expect(roots[3].root).toBe(join(projectDir, ".claude", "skills"));
    expect(roots[4].root).toBe(join(configHome, "opencode", "skill"));
    expect(roots[5].root).toBe(join(homeDir, ".claude", "skills"));
  });

  test("discovers skills across project and global roots", async () => {
    const alphaDir = join(projectDir, ".opencode", "skill", "alpha");
    const betaDir = join(projectDir, ".claude", "skills", "beta");
    const gammaDir = join(configHome, "opencode", "skill", "gamma");
    const deltaDir = join(homeDir, ".claude", "skills", "delta");
    await Promise.all([
      mkdir(alphaDir, { recursive: true }),
      mkdir(betaDir, { recursive: true }),
      mkdir(gammaDir, { recursive: true }),
      mkdir(deltaDir, { recursive: true }),
    ]);
    await Promise.all([
      writeFile(
        join(alphaDir, "SKILL.md"),
        "---\nname: alpha\ndescription: alpha\n---\n",
      ),
      writeFile(
        join(betaDir, "SKILL.md"),
        "---\nname: beta\ndescription: beta\n---\n",
      ),
      writeFile(
        join(gammaDir, "SKILL.md"),
        "---\nname: gamma\ndescription: gamma\n---\n",
      ),
      writeFile(
        join(deltaDir, "SKILL.md"),
        "---\nname: delta\ndescription: delta\n---\n",
      ),
    ]);

    const skills = await discoverSkills({
      directory: nestedDir,
      worktree: projectDir,
      xdgConfigHome: configHome,
      homeDir,
    });

    const byName = (name: string) =>
      skills.find((entry) => entry.name === name);

    expect(byName("alpha")?.source).toBe("project");
    expect(byName("beta")?.source).toBe("project-claude");
    expect(byName("gamma")?.source).toBe("global");
    expect(byName("delta")?.source).toBe("global-claude");
  });
});
