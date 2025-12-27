import { describe, expect, test } from "bun:test";
import { parseSkillFile, serializeSkillFile } from "../../src/skills/parse";

describe("skills parse", () => {
  test("parses frontmatter and body", () => {
    const content = `---
name: coder
description: Write clean code
model: auto
---

You are a careful coder.`;

    const parsed = parseSkillFile(content);
    expect(parsed.frontmatter.name).toBe("coder");
    expect(parsed.frontmatter.description).toBe("Write clean code");
    expect(parsed.frontmatter.model).toBe("auto");
    expect(parsed.body).toContain("You are a careful coder.");
  });

  test("serializes frontmatter and body", () => {
    const serialized = serializeSkillFile(
      { name: "docs", description: "Docs helper", model: "auto" },
      "Read documentation.",
    );
    expect(serialized).toContain("name: docs");
    expect(serialized).toContain("description: Docs helper");
    expect(serialized).toContain("model: auto");
    expect(serialized).toContain("Read documentation.");
  });

  test("throws when frontmatter markers are missing", () => {
    expect(() => parseSkillFile("no frontmatter")).toThrow("Skill file must start");
    expect(() => parseSkillFile("---\nname: coder\n")).toThrow("Skill frontmatter must be closed");
  });

  test("handles UTF-8 BOM", () => {
    const content = `\uFEFF---\nname: bom\nmodel: auto\n---\n\nHello`;
    const parsed = parseSkillFile(content);
    expect(parsed.frontmatter.name).toBe("bom");
    expect(parsed.body).toBe("Hello");
  });

  test("throws when frontmatter is not an object", () => {
    const content = `---\n- bad\n---\n\nBody`;
    expect(() => parseSkillFile(content)).toThrow("Skill frontmatter must be a YAML object");
  });
});
