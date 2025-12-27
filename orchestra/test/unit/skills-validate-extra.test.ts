import { describe, expect, test } from "bun:test";
import { validateSkillFrontmatter, validateSkillInput } from "../../src/skills/validate";
import type { SkillFrontmatter } from "../../src/types";

describe("skills validate extra coverage", () => {
  test("reports missing and oversized frontmatter fields", () => {
    const frontmatter = {
      description: "x".repeat(2000),
      model: "auto",
    } as SkillFrontmatter;

    const result = validateSkillFrontmatter(frontmatter);
    expect(result.valid).toBe(false);
    expect(result.errors.some((err) => err.field === "name")).toBe(true);
    expect(result.errors.some((err) => err.field === "description")).toBe(true);
  });

  test("reports invalid permissions shapes", () => {
    const frontmatter = {
      name: "valid-name",
      description: "valid",
      model: "auto",
      permissions: "bad" as unknown,
    } as SkillFrontmatter;
    const result = validateSkillFrontmatter(frontmatter);
    expect(result.errors.some((err) => err.field === "permissions")).toBe(true);
  });

  test("validates permissions categories, tools, and paths", () => {
    const frontmatter = {
      name: "valid-name",
      description: "valid",
      model: "auto",
      permissions: {
        categories: { filesystem: "bad", execution: "bad", network: "bad" },
        tools: {
          build: { enabled: true, constraints: { limit: 1 } },
          bad: "nope",
        },
        paths: { allowed: ["src"], denied: ["dist"] },
      },
    } as SkillFrontmatter;

    const result = validateSkillFrontmatter(frontmatter);
    expect(result.errors.some((err) => err.field.includes("permissions.categories"))).toBe(true);
    expect(result.errors.some((err) => err.field.startsWith("permissions.tools"))).toBe(true);
    expect(result.errors.some((err) => err.field === "permissions.paths")).toBe(false);
  });

  test("reports invalid permissions subfields", () => {
    const frontmatter = {
      name: "valid-name",
      description: "valid",
      model: "auto",
      permissions: {
        categories: "nope",
        tools: "bad",
        paths: "bad",
      },
    } as SkillFrontmatter;

    const result = validateSkillFrontmatter(frontmatter);
    expect(result.errors.some((err) => err.field === "permissions.categories")).toBe(true);
    expect(result.errors.some((err) => err.field === "permissions.tools")).toBe(true);
    expect(result.errors.some((err) => err.field === "permissions.paths")).toBe(true);
  });

  test("reports invalid skill input ids", () => {
    const missing = validateSkillInput({
      id: "" as string,
      frontmatter: { description: "desc", model: "auto" },
      systemPrompt: "",
    });
    expect(missing.errors.some((err) => err.field === "id")).toBe(true);

    const badPattern = validateSkillInput({
      id: "Bad Id",
      frontmatter: { description: "desc", model: "auto" },
      systemPrompt: "",
    });
    expect(badPattern.errors.some((err) => err.field === "id")).toBe(true);

    const tooLong = validateSkillInput({
      id: "a".repeat(100),
      frontmatter: { description: "desc", model: "auto" },
      systemPrompt: "",
    });
    expect(tooLong.errors.some((err) => err.field === "id")).toBe(true);
  });

  test("reports invalid systemPrompt types", () => {
    const result = validateSkillInput({
      id: "valid-id",
      frontmatter: { description: "desc", model: "auto" },
      systemPrompt: 123 as unknown as string,
    });
    expect(result.errors.some((err) => err.field === "systemPrompt")).toBe(true);
  });
});
