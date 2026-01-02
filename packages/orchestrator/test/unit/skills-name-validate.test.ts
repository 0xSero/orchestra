import { describe, expect, test } from "bun:test";
import {
  validateSkillDefinition,
  validateSkillDescription,
  validateSkillName,
} from "../../src/skills/validate";

describe("skills validation", () => {
  test("accepts valid skill names", () => {
    const names = ["a", "abc", "git-release", "abc123", "a1-b2"];
    for (const name of names) {
      expect(validateSkillName(name)).toBeUndefined();
    }
  });

  test("rejects invalid skill names", () => {
    const names = [
      "",
      "A",
      "bad_name",
      "-start",
      "end-",
      "double--dash",
      "two words",
    ];
    for (const name of names) {
      expect(validateSkillName(name)).toBeTruthy();
    }
  });

  test("rejects names longer than 64 characters", () => {
    const name = "a".repeat(65);
    expect(validateSkillName(name)).toBeTruthy();
  });

  test("validates description length", () => {
    expect(validateSkillDescription("")).toBeTruthy();
    expect(validateSkillDescription("ok")).toBeUndefined();
    expect(validateSkillDescription("a".repeat(1025))).toBeTruthy();
  });

  test("requires name to match directory", () => {
    const ok = validateSkillDefinition({
      name: "git-release",
      directoryName: "git-release",
    });
    expect(ok.ok).toBe(true);
    const bad = validateSkillDefinition({
      name: "git-release",
      directoryName: "gitrelease",
    });
    expect(bad.ok).toBe(false);
  });
});
