import { describe, expect, test } from "bun:test";
import { findProfile, suggestProfiles } from "../../src/profiles/discovery";
import type { WorkerProfile } from "../../src/types";

describe("profile discovery", () => {
  const profiles: Record<string, WorkerProfile> = {
    vision: {
      id: "vision",
      name: "Vision Agent",
      model: "vision-model",
      purpose: "See images",
      whenToUse: "Use for screenshots",
      tags: ["image", "ocr"],
      supportsVision: true,
    },
    coder: {
      id: "coder",
      name: "Coder",
      model: "code-model",
      purpose: "Write code",
      whenToUse: "Fix bugs",
      tags: ["refactor", "build"],
    },
    docs: {
      id: "docs",
      name: "Docs Helper",
      model: "docs-model",
      purpose: "Documentation",
      whenToUse: "Reference APIs",
      tags: ["reference"],
    },
  };

  test("scores profiles based on keywords and tokens", () => {
    const suggestions = suggestProfiles("Need documentation reference", profiles);
    expect(suggestions[0]?.id).toBe("docs");
    expect(suggestions[0]?.reason).toContain("documentation");
  });

  test("matches tags and ids in queries", () => {
    const suggestions = suggestProfiles("vision image ocr", profiles, { limit: 2 });
    expect(suggestions[0]?.id).toBe("vision");
    expect(findProfile("fix a bug", profiles)).toBe("coder");
  });

  test("returns no suggestions when query is empty", () => {
    expect(suggestProfiles("", profiles)).toEqual([]);
  });
});
