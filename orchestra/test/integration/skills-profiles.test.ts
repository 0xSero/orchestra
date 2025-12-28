import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getIntegrationEnv, getIntegrationTools } from "../../src/integrations/registry";
import { resolveIntegrationsForProfile } from "../../src/integrations/selection";
import { serializeSkillFile } from "../../src/skills/parse";
import type { IntegrationsConfig } from "../../src/types";
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

  test("skill can select Linear integration for workers", async () => {
    const projectDir = await mkdtemp(join(tmpdir(), "orch-skill-linear-"));
    const skillDir = join(projectDir, ".opencode", "skill", "linear");
    await mkdir(skillDir, { recursive: true });

    await writeFile(
      join(skillDir, "SKILL.md"),
      serializeSkillFile(
        {
          name: "linear",
          description: "Linear helper",
          model: "auto",
          integrations: { include: ["linear"] },
        },
        "Use Linear tools.",
      ),
    );

    const profiles = await getAllProfiles(projectDir);
    const profile = profiles.linear;
    expect(profile).toBeTruthy();
    expect(profile.integrations).toEqual({ include: ["linear"] });

    const selected = resolveIntegrationsForProfile(profile, {
      linear: { apiKey: "key", teamId: "team" },
      monitoring: { enabled: true },
    });
    expect(Object.keys(selected)).toEqual(["linear"]);

    const env = getIntegrationEnv(selected);
    expect(env.LINEAR_API_KEY).toBe("key");
    expect(env.LINEAR_TEAM_ID).toBe("team");

    const tools = getIntegrationTools(selected as IntegrationsConfig);
    expect(tools.orchestrator.linear_create_issue).toBeDefined();
    expect(tools.workers.linear_get_issue).toBeDefined();
  });
});
