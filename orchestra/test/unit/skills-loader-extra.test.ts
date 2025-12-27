import { describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadSkill, loadSkillOverrides } from "../../src/skills/loader";
import { serializeSkillFile } from "../../src/skills/parse";

const writeSkillFile = async (root: string, id: string, frontmatter: Record<string, unknown>) => {
  const dir = join(root, ".opencode", "skill", id);
  await mkdir(dir, { recursive: true });
  const content = serializeSkillFile(frontmatter, "System prompt");
  await writeFile(join(dir, "SKILL.md"), content, "utf8");
};

describe("skills loader extra coverage", () => {
  test("throws when skill name mismatches directory", async () => {
    const projectDir = await mkdtemp(join(tmpdir(), "orch-skill-loader-"));
    try {
      await writeSkillFile(projectDir, "alpha", { name: "beta", description: "desc", model: "auto" });
      await expect(loadSkill("alpha", projectDir)).rejects.toThrow("must match directory");
    } finally {
      await rm(projectDir, { recursive: true, force: true }).catch(() => {});
    }
  });

  test("ignores invalid skill overrides", async () => {
    const projectDir = await mkdtemp(join(tmpdir(), "orch-skill-invalid-"));
    try {
      await writeSkillFile(projectDir, "broken", { name: "broken", description: "", model: "" });
      const overrides = await loadSkillOverrides(projectDir);
      expect(overrides.has("broken")).toBe(false);
    } finally {
      await rm(projectDir, { recursive: true, force: true }).catch(() => {});
    }
  });

  test("returns undefined when skill is missing", async () => {
    const projectDir = await mkdtemp(join(tmpdir(), "orch-skill-missing-"));
    try {
      const skill = await loadSkill("missing", projectDir);
      expect(skill).toBeUndefined();
    } finally {
      await rm(projectDir, { recursive: true, force: true }).catch(() => {});
    }
  });
});
