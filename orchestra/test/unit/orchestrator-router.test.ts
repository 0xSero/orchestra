import { describe, expect, test } from "bun:test";
import { selectWorkerId } from "../../src/orchestrator/router";
import type { WorkerProfile } from "../../src/types";

describe("orchestrator router selection", () => {
  test("selects vision worker when attachments include images", () => {
    const profiles: Record<string, WorkerProfile> = {
      vision: {
        id: "vision",
        name: "Vision",
        model: "model-a",
        purpose: "vision",
        whenToUse: "vision",
        supportsVision: true,
      },
    };

    const selected = selectWorkerId({
      task: "analyze",
      profiles,
      attachments: [{ type: "image", base64: "abc" }],
    });
    expect(selected).toBe("vision");
  });

  test("selects suggested profile and falls back to coder or first profile", () => {
    const profiles: Record<string, WorkerProfile> = {
      docs: {
        id: "docs",
        name: "Docs",
        model: "model-a",
        purpose: "docs",
        whenToUse: "docs",
      },
      coder: {
        id: "coder",
        name: "Coder",
        model: "model-b",
        purpose: "code",
        whenToUse: "code",
      },
    };

    expect(selectWorkerId({ task: "documentation reference", profiles })).toBe("docs");
    expect(selectWorkerId({ task: "unknown task", profiles })).toBe("coder");

    const fallback = selectWorkerId({
      task: "unknown task",
      profiles: { alpha: profiles.docs },
    });
    expect(fallback).toBe("alpha");
  });
});
