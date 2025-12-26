import { describe, expect, test } from "bun:test";
import { validateSkillFrontmatter } from "../../src/skills/validate";
import type { SkillFrontmatter } from "../../src/types";

describe("skills validate", () => {
  test("rejects invalid name", () => {
    const frontmatter = {
      name: "Bad Name",
      description: "test",
      model: "auto",
    } as SkillFrontmatter;
    const result = validateSkillFrontmatter(frontmatter);
    expect(result.valid).toBe(false);
    expect(result.errors.some((err) => err.field === "name")).toBe(true);
  });

  test("accepts minimal valid frontmatter", () => {
    const frontmatter = {
      name: "coder",
      description: "Write code",
      model: "auto",
    } as SkillFrontmatter;
    const result = validateSkillFrontmatter(frontmatter);
    expect(result.valid).toBe(true);
  });
});
