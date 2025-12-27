import { describe, expect, test } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSkill, deleteSkill, duplicateSkill, updateSkill } from "../../src/skills/crud";

describe("skills crud", () => {
  test("create, update, duplicate, delete", async () => {
    const projectDir = await mkdtemp(join(tmpdir(), "orch-skill-crud-"));

    const created = await createSkill(
      {
        id: "tester",
        frontmatter: {
          description: "Test skill",
          model: "auto",
        },
        systemPrompt: "Test prompt",
      },
      "project",
      projectDir,
    );
    expect(created.id).toBe("tester");

    const updated = await updateSkill(
      "tester",
      { frontmatter: { description: "Updated skill", model: "auto" } },
      "project",
      projectDir,
    );
    expect(updated.frontmatter.description).toBe("Updated skill");

    const duplicate = await duplicateSkill("tester", "tester-copy", "project", projectDir);
    expect(duplicate.id).toBe("tester-copy");

    const deleted = await deleteSkill("tester", "project", projectDir);
    expect(deleted).toBe(true);
  });
});
