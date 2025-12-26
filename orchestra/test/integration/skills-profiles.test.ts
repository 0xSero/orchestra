import { describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getAllProfilesWithSkills, builtInProfiles } from "../../src/workers/profiles";
import { serializeSkillFile } from "../../src/skills/parse";

describe("skills profiles", () => {
  test("skill overrides profile config and supports compose", async () => {
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
          compose: ["coder", "docs"],
        },
        "Full stack prompt"
      )
    );

    const profiles = await getAllProfilesWithSkills(projectDir, builtInProfiles);
    const profile = profiles["full-stack"];
    expect(profile).toBeTruthy();
    expect(profile.model).toBe("auto");
    expect(profile.tools?.write).toBe(false);
  });
});
