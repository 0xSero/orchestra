import { describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSkill, deleteSkill, listSkillOverrides } from "../../src/skills/crud";
import { serializeSkillFile } from "../../src/skills/parse";
import { getSkillFilePath } from "../../src/skills/paths";

const writeSkill = async (projectDir: string, id: string) => {
  const filePath = getSkillFilePath(id, "project", projectDir);
  await mkdir(join(projectDir, ".opencode", "skill", id), { recursive: true });
  const content = serializeSkillFile(
    { name: id, description: `desc-${id}`, model: "auto" },
    `Prompt for ${id}`,
  );
  await writeFile(filePath, content, "utf8");
  return filePath;
};

describe("skills crud extra coverage", () => {
  test("handles existing skills and deletes by scope", async () => {
    const projectDir = await mkdtemp(join(tmpdir(), "orch-skills-crud-"));

    try {
      await writeSkill(projectDir, "alpha");
      await expect(
        createSkill(
          { id: "alpha", frontmatter: { description: "desc", model: "auto" }, systemPrompt: "" },
          "project",
          projectDir,
        ),
      ).rejects.toThrow("already exists");

      const deleted = await deleteSkill("alpha", "project", projectDir);
      expect(deleted).toBe(true);

      const missing = await deleteSkill("missing", "project", projectDir);
      expect(missing).toBe(false);
    } finally {
      await rm(projectDir, { recursive: true, force: true }).catch(() => {});
    }
  });

  test("returns validation errors for invalid input", async () => {
    await expect(
      createSkill({ id: "bad", frontmatter: { description: "", model: "" }, systemPrompt: "" }, "global"),
    ).rejects.toThrow("Invalid skill input");
  });

  test("lists skill overrides from project dir", async () => {
    const projectDir = await mkdtemp(join(tmpdir(), "orch-skills-overrides-"));
    try {
      await writeSkill(projectDir, "beta");
      const overrides = await listSkillOverrides(projectDir);
      expect(overrides.some((skill) => skill.id === "beta")).toBe(true);
    } finally {
      await rm(projectDir, { recursive: true, force: true }).catch(() => {});
    }
  });
});
