import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { serializeSkillFile } from "../../src/skills/parse";
import { getAllProfiles } from "../../src/workers/profiles";

describe("skills profiles", () => {
  test("skill loads from skills directory", async () => {
    const projectDir = await mkdtemp(join(tmpdir(), "orch-skill-profiles-"));
    const skillDir = join(projectDir, ".opencode", "skill", "full-stack");
    await mkdir(skillDir, { recursive: true });

    await writeFile(
      join(skillDir, "SKILL.md"),
      serializeSkillFile(
        {
          name: "full-stack",
          description: "Full stack helper",
          model: "auto",
        },
        "Full stack prompt",
      ),
    );

    const profiles = await getAllProfiles(projectDir);
    const profile = profiles["full-stack"];
    expect(profile).toBeTruthy();
    expect(profile.model).toBe("auto");
    expect(profile.systemPrompt).toBe("Full stack prompt");
  });
});
