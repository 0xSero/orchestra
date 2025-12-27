import { describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, rename } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { profileToSkill, skillToProfile } from "../../src/skills/convert";
import {
  resolveProjectDir,
  hasProjectSkillDirs,
  getProjectSkillsDirs,
  getGlobalSkillsDir,
  getProjectSubagentsDir,
  getSubagentDir,
} from "../../src/skills/paths";
import { validateSkillFrontmatter, validateSkillInput } from "../../src/skills/validate";

describe("skills convert", () => {
  test("converts profiles to skills and back", () => {
    const skill = profileToSkill(
      {
        id: "worker",
        name: "Worker",
        model: "model-a",
        purpose: "Purpose",
        whenToUse: "When to use",
      },
      { type: "builtin" },
    );

    expect(skill.frontmatter.description).toContain("When to use");

    const profile = skillToProfile(skill);
    expect(profile.id).toBe("worker");
    expect(profile.model).toBe("model-a");
  });

  test("caps long descriptions", () => {
    const long = "a".repeat(2000);
    const skill = profileToSkill(
      {
        id: "long",
        name: "Long",
        model: "model-a",
        purpose: long,
        whenToUse: long,
      },
      { type: "builtin" },
    );
    expect(skill.frontmatter.description.length).toBeLessThanOrEqual(1024);
  });
});

describe("skills validate", () => {
  test("reports validation errors", () => {
    const result = validateSkillFrontmatter({
      name: "Bad Name!",
      description: "",
      model: "",
      temperature: 3,
      tools: { run: "yes" as unknown as boolean },
      tags: "tag" as unknown as string[],
      supportsVision: "yes" as unknown as boolean,
      supportsWeb: 1 as unknown as boolean,
      injectRepoContext: "no" as unknown as boolean,
      extends: 123 as unknown as string,
      compose: "bad" as unknown as string[],
      permissions: {
        categories: { filesystem: "bad" },
        tools: { ask: { enabled: "yes" } },
        paths: { allowed: ["ok", 1] },
      } as unknown,
    });
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  test("validates skill input", () => {
    const input = {
      id: "skill-id",
      frontmatter: { description: "desc", model: "auto" },
      systemPrompt: "",
    };
    const result = validateSkillInput(input);
    expect(result.valid).toBe(true);
  });
});

describe("skills paths", () => {
  test("resolves explicit project directories", async () => {
    const dir = await mkdtemp(join(tmpdir(), "orch-skill-paths-"));
    expect(resolveProjectDir(dir)).toBe(dir);

    const skillDir = join(dir, ".opencode", "skill");
    await mkdir(skillDir, { recursive: true });
    expect(hasProjectSkillDirs(dir)).toBe(true);
    expect(getProjectSkillsDirs(dir)[0]).toContain(".opencode");
    expect(getGlobalSkillsDir()).toContain(".opencode");
  });

  test("resolves module root and inferred paths", async () => {
    const moduleRoot = resolveProjectDir();
    expect(moduleRoot).toContain("orchestra");

    const skillDir = join(moduleRoot!, ".opencode", "skill");
    const hiddenDir = join(moduleRoot!, ".opencode", "skill-hidden");
    const subagentsDir = join(moduleRoot!, ".opencode", "agent", "subagents");
    const hiddenSubagentsDir = join(moduleRoot!, ".opencode", "agent", "subagents-hidden");
    let movedSkill = false;
    let movedSubagents = false;
    await rename(skillDir, hiddenDir);
    movedSkill = true;
    await rename(subagentsDir, hiddenSubagentsDir);
    movedSubagents = true;
    try {
      expect(resolveProjectDir()).toBeUndefined();
    } finally {
      if (movedSubagents) {
        await rename(hiddenSubagentsDir, subagentsDir);
      }
      if (movedSkill) {
        await rename(hiddenDir, skillDir);
      }
    }
  });

  test("resolves subagent directories and throws without project dir", async () => {
    const dir = await mkdtemp(join(tmpdir(), "orch-subagent-paths-"));
    const subagentDir = join(dir, ".opencode", "agent", "subagents");
    await mkdir(subagentDir, { recursive: true });

    expect(getProjectSubagentsDir(dir)).toContain("subagents");
    expect(() => getSubagentDir("alpha", "project")).toThrow("Project directory is required");

    const emptyDir = await mkdtemp(join(tmpdir(), "orch-subagent-empty-"));
    expect(getProjectSubagentsDir(emptyDir)).toBe(join(emptyDir, ".opencode", "agent", "subagents"));
  });
});
