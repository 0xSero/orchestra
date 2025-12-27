import { describe, expect, test } from "bun:test";
import type { Skill } from "../../src/types";

const baseSkill: Skill = {
  id: "base",
  source: { type: "project" },
  frontmatter: { name: "Base", description: "Base profile", model: "model-a" },
  systemPrompt: "",
  filePath: "/tmp/base/SKILL.md",
  hasScripts: false,
  hasReferences: false,
  hasAssets: false,
};

const loadAllSkills = async () => new Map<string, Skill>([["base", baseSkill]]);

describe("profile helpers", () => {
  test("validates required fields", async () => {
    const { validateProfile } = await import("../../src/workers/profiles");
    const errors = validateProfile({ id: "id" });
    expect(errors.length).toBeGreaterThan(0);
  });

  test("applies overrides and inheritance", async () => {
    const { getAllProfiles } = await import("../../src/workers/profiles");
    const profiles = await getAllProfiles(undefined, [
      {
        id: "child",
        name: "Child",
        model: "model-b",
        purpose: "child purpose",
        whenToUse: "child use",
        extends: "base",
      },
    ], { loadAllSkills });

    expect(profiles.child).toBeDefined();
    expect(profiles.child?.name).toBe("Child");
  });

  test("applies direct overrides", async () => {
    const { applyProfileOverrides } = await import("../../src/workers/profiles");
    const base = {
      base: {
        id: "base",
        name: "Base",
        model: "model-a",
        purpose: "base",
        whenToUse: "use",
        tools: { toolA: true },
      },
    };

    const updated = applyProfileOverrides(base, [{ id: "base", name: "Base2", tools: { toolB: true } }]);
    expect(updated.base.name).toBe("Base2");
    expect(updated.base.tools).toEqual({ toolA: true, toolB: true });
  });

  test("lists profile IDs", async () => {
    const { listProfileIds } = await import("../../src/workers/profiles");
    const ids = await listProfileIds(undefined, { loadAllSkills });
    expect(ids).toContain("base");
  });

  test("returns profiles and exposes deprecated helpers", async () => {
    const { getProfile, getAllProfilesWithSkills, mergeProfile } = await import("../../src/workers/profiles");
    const profiles = await getAllProfilesWithSkills(undefined);
    expect(getProfile("missing", profiles)).toBeUndefined();

    expect(() => mergeProfile("base", {})).toThrow("deprecated");
  });
});
