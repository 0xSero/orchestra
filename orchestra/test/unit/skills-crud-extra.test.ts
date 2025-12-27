import { describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSkill, deleteSkill, duplicateSkill, listSkillOverrides, updateSkill } from "../../src/skills/crud";
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
  test("creates, updates, and duplicates skills", async () => {
    const projectDir = await mkdtemp(join(tmpdir(), "orch-skills-crud-create-"));

    try {
      const created = await createSkill(
        {
          id: "alpha",
          frontmatter: { name: "alpha", description: "desc", model: "auto" },
          systemPrompt: "Prompt",
        },
        "project",
        projectDir,
      );
      expect(created.id).toBe("alpha");

      const updated = await updateSkill(
        "alpha",
        { frontmatter: { description: "updated" }, systemPrompt: "Next" },
        "project",
        projectDir,
      );
      expect(updated.frontmatter.description).toBe("updated");
      expect(updated.systemPrompt).toBe("Next");

      const duplicated = await duplicateSkill("alpha", "alpha-copy", "project", projectDir);
      expect(duplicated.id).toBe("alpha-copy");
    } finally {
      await rm(projectDir, { recursive: true, force: true }).catch(() => {});
    }
  });
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

  test("throws when duplicating missing skills", async () => {
    await expect(duplicateSkill("missing", "copy", "global")).rejects.toThrow("Source skill \"missing\" not found.");
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
