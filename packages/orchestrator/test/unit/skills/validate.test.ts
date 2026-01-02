import { describe, expect, test } from "bun:test";
import {
  validateSkillName,
  validateSkillDescription,
  validateSkillDefinition,
  SKILL_NAME_REGEX,
} from "../../../src/skills/validate";

describe("SKILL_NAME_REGEX", () => {
  test("matches valid skill names", () => {
    expect(SKILL_NAME_REGEX.test("docs-research")).toBe(true);
    expect(SKILL_NAME_REGEX.test("code-implementer")).toBe(true);
    expect(SKILL_NAME_REGEX.test("a")).toBe(true);
    expect(SKILL_NAME_REGEX.test("my-skill-name")).toBe(true);
  });

  test("does not match invalid names", () => {
    expect(SKILL_NAME_REGEX.test("DocsResearch")).toBe(false);
    expect(SKILL_NAME_REGEX.test("docs_research")).toBe(false);
    expect(SKILL_NAME_REGEX.test("docs-research-")).toBe(false);
    expect(SKILL_NAME_REGEX.test("-docs")).toBe(false);
  });
});

describe("validateSkillName", () => {
  test("returns undefined for valid names", () => {
    expect(validateSkillName("docs-research")).toBeUndefined();
    expect(validateSkillName("code")).toBeUndefined();
    expect(validateSkillName("a")).toBeUndefined();
  });

  test("returns error for empty string", () => {
    expect(validateSkillName("")).toBe("name is required");
    expect(validateSkillName("   ")).toBe("name is required");
  });

  test("returns error for name too long", () => {
    expect(validateSkillName("a".repeat(65))).toBe(
      "name must be 1-64 characters",
    );
  });

  test("returns error for invalid pattern", () => {
    expect(validateSkillName("DocsResearch")).toBe(
      "name must match ^[a-z0-9]+(-[a-z0-9]+)*$",
    );
    expect(validateSkillName("docs_research")).toBe(
      "name must match ^[a-z0-9]+(-[a-z0-9]+)*$",
    );
  });

  test("returns error for non-string input", () => {
    expect(validateSkillName(undefined as unknown as string)).toBe(
      "name is required",
    );
    expect(validateSkillName(123 as unknown as string)).toBe(
      "name is required",
    );
    expect(validateSkillName(null as unknown as string)).toBe(
      "name is required",
    );
  });
});

describe("validateSkillDescription", () => {
  test("returns undefined for valid description", () => {
    expect(validateSkillDescription("A simple description")).toBeUndefined();
    expect(validateSkillDescription("x".repeat(1024))).toBeUndefined();
  });

  test("returns error for empty string", () => {
    expect(validateSkillDescription("")).toBe("description is required");
    expect(validateSkillDescription("   ")).toBe("description is required");
  });

  test("returns error for description too long", () => {
    expect(validateSkillDescription("x".repeat(1025))).toBe(
      "description must be 1-1024 characters",
    );
  });

  test("returns error for non-string input", () => {
    expect(validateSkillDescription(undefined as unknown as string)).toBe(
      "description is required",
    );
  });
});

describe("validateSkillDefinition", () => {
  test("returns valid result for correct input", () => {
    const result = validateSkillDefinition({
      name: "docs-research",
      description: "Research documentation",
      directoryName: "docs-research",
    });
    expect(result.ok).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  test("returns invalid result for name error", () => {
    const result = validateSkillDefinition({
      name: "Invalid",
      description: "A description",
    });
    expect(result.ok).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toContain("name");
  });

  test("returns invalid result for description error", () => {
    const result = validateSkillDefinition({
      name: "docs-research",
      description: "",
    });
    expect(result.ok).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toContain("description");
  });

  test("returns invalid result for directory mismatch", () => {
    const result = validateSkillDefinition({
      name: "docs-research",
      description: "A description",
      directoryName: "different-name",
    });
    expect(result.ok).toBe(false);
    expect(result.errors).toContain("name must match directory name");
  });

  test("ignores description if not provided", () => {
    const result = validateSkillDefinition({
      name: "docs-research",
    });
    expect(result.ok).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  test("accumulates multiple errors", () => {
    const result = validateSkillDefinition({
      name: "Invalid-Name",
      description: "",
      directoryName: "wrong",
    });
    expect(result.ok).toBe(false);
    expect(result.errors.length).toBeGreaterThanOrEqual(2);
  });
});
