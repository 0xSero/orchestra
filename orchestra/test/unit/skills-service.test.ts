import { describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSkillsService } from "../../src/skills/service";
import { serializeSkillFile } from "../../src/skills/parse";

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
});
