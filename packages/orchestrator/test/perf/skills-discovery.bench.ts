import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { benchmark } from "../helpers/benchmark";
import { discoverSkills } from "../../src/skills/discovery";

describe("skills discovery benchmark", () => {
  let tmpDir: string;
  let projectDir: string;
  let workDir: string;

  beforeAll(async () => {
    tmpDir = await mkdtemp(join(process.cwd(), ".tmp", "skills-bench-"));
    projectDir = join(tmpDir, "repo");
    workDir = join(projectDir, "src");
    await mkdir(workDir, { recursive: true });

    const projectSkillRoot = join(projectDir, ".opencode", "skill");
    const claudeSkillRoot = join(projectDir, ".claude", "skills");
    await Promise.all([
      mkdir(projectSkillRoot, { recursive: true }),
      mkdir(claudeSkillRoot, { recursive: true }),
    ]);

    const total = 200;
    const writes: Promise<void>[] = [];
    for (let i = 0; i < total; i += 1) {
      const name = `bench-skill-${i}`;
      const projectDirPath = join(projectSkillRoot, name);
      const claudeDirPath = join(claudeSkillRoot, name);
      await Promise.all([
        mkdir(projectDirPath, { recursive: true }),
        mkdir(claudeDirPath, { recursive: true }),
      ]);
      writes.push(
        writeFile(
          join(projectDirPath, "SKILL.md"),
          `---\nname: ${name}\ndescription: bench\n---\n`,
        ),
        writeFile(
          join(claudeDirPath, "SKILL.md"),
          `---\nname: ${name}\ndescription: bench\n---\n`,
        ),
      );
    }
    await Promise.all(writes);
  });

  afterAll(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  test("discoverSkills scans project roots", async () => {
    const result = await benchmark(
      "skills discovery",
      async () => {
        await discoverSkills({
          directory: workDir,
          worktree: projectDir,
          includeGlobal: false,
        });
      },
      { iterations: 20, warmup: 5, timeout: 30_000 },
    );

    expect(result.mean).toBeGreaterThan(0);
  });
});
