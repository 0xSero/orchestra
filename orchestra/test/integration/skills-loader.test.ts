import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadAllSkills, loadSkill, loadSkillOverrides } from "../../src/skills/loader";
import { serializeSkillFile } from "../../src/skills/parse";

let tempDir: string;
let homeDir: string;

describe("skills loader", () => {
  beforeAll(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "orch-skill-project-"));
    homeDir = await mkdtemp(join(tmpdir(), "orch-skill-home-"));
    process.env.OPENCODE_SKILLS_HOME = homeDir;
  });

  afterAll(() => {
    delete process.env.OPENCODE_SKILLS_HOME;
  });

  test("global overrides project", async () => {
    // Use new path: .opencode/skill/{id}/SKILL.md
    const projectSkillDir = join(tempDir, ".opencode", "skill", "coder");
    const globalSkillDir = join(homeDir, ".opencode", "skill", "coder");

    await mkdir(projectSkillDir, { recursive: true });
    await mkdir(globalSkillDir, { recursive: true });

    await writeFile(
      join(globalSkillDir, "SKILL.md"),
      serializeSkillFile({ name: "coder", description: "global coder", model: "auto" }, "Global prompt"),
    );

    await writeFile(
      join(projectSkillDir, "SKILL.md"),
      serializeSkillFile({ name: "coder", description: "project coder", model: "auto" }, "Project prompt"),
    );

    const all = await loadAllSkills(tempDir);
    const coder = all.get("coder");
    expect(coder?.source.type).toBe("global");
    expect(coder?.frontmatter.description).toBe("global coder");

    const overrides = await loadSkillOverrides(tempDir);
    const override = overrides.get("coder");
    expect(override?.source.type).toBe("global");

    const direct = await loadSkill("coder", tempDir);
    expect(direct?.frontmatter.description).toBe("global coder");
  });
});
