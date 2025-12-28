import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { serializeSkillFile } from "../../src/skills/parse";
import { createSkillsService } from "../../src/skills/service";

describe("skills service", () => {
  test("lists and retrieves skills", async () => {
    const projectDir = await mkdtemp(join(tmpdir(), "orch-skill-service-"));
    const skillDir = join(projectDir, ".opencode", "skill", "alpha");
    await mkdir(skillDir, { recursive: true });
    await writeFile(
      join(skillDir, "SKILL.md"),
      serializeSkillFile({ name: "alpha", description: "desc", model: "auto" }, "Prompt"),
      "utf8",
    );

    const service = createSkillsService(projectDir);
    try {
      const list = await service.list();
      expect(list.some((skill) => skill.id === "alpha")).toBe(true);

      const skill = await service.get("alpha");
      expect(skill?.id).toBe("alpha");
    } finally {
      await rm(projectDir, { recursive: true, force: true }).catch(() => {});
    }
  });

  test("creates, updates, duplicates, and deletes skills with events", async () => {
    const projectDir = await mkdtemp(join(tmpdir(), "orch-skill-service-events-"));
    const service = createSkillsService(projectDir);
    const events: string[] = [];
    const unsubscribe = service.events.on((event) => events.push(event.type));

    try {
      const created = await service.create(
        {
          id: "alpha",
          frontmatter: { name: "alpha", description: "desc", model: "auto" },
          systemPrompt: "Prompt",
        },
        "project",
      );
      expect(created.id).toBe("alpha");

      const updated = await service.update(
        "alpha",
        { frontmatter: { description: "updated", model: "auto" } },
        "project",
      );
      expect(updated.frontmatter.description).toBe("updated");

      const duplicate = await service.duplicate("alpha", "alpha-copy", "project");
      expect(duplicate.id).toBe("alpha-copy");

      const deleted = await service.delete("alpha-copy", "project");
      expect(deleted).toBe(true);
      expect(events).toContain("skill.created");
      expect(events).toContain("skill.updated");
      expect(events).toContain("skill.deleted");
    } finally {
      unsubscribe();
      await rm(projectDir, { recursive: true, force: true }).catch(() => {});
    }
  });
});
