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
});
