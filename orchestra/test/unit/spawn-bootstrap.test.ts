import { describe, expect, test } from "bun:test";
import { buildBootstrapPromptArgs } from "../../src/workers/spawn-bootstrap";
import type { WorkerProfile } from "../../src/types";

describe("spawn bootstrap", () => {
  test("builds prompt with system context, repo context, and permissions", () => {
    const profile: WorkerProfile = {
      id: "alpha",
      name: "Alpha",
      model: "opencode/gpt-5-nano",
      purpose: "test",
      whenToUse: "testing",
      systemPrompt: "System notes",
      supportsVision: true,
      supportsWeb: false,
    };

    const args = buildBootstrapPromptArgs({
      sessionId: "session-1",
      directory: "/tmp",
      profile,
      permissionSummary: "allow read",
      repoContext: "Repo context",
    });

    expect(args.path.id).toBe("session-1");
    const text = args.body?.parts?.[0]?.text ?? "";
    expect(text).toContain("<system-context>");
    expect(text).toContain("Repo context");
    expect(text).toContain("<worker-permissions>");
    expect(text).toContain("\"vision\":true");
    expect(text).toContain("\"web\":false");
  });

  test("builds prompt without optional sections", () => {
    const profile: WorkerProfile = {
      id: "beta",
      name: "Beta",
      model: "opencode/gpt-5-nano",
      purpose: "test",
      whenToUse: "testing",
    };

    const args = buildBootstrapPromptArgs({
      sessionId: "session-2",
      directory: "/tmp",
      profile,
    });

    const text = args.body?.parts?.[0]?.text ?? "";
    expect(text).not.toContain("<system-context>");
    expect(text).not.toContain("<worker-permissions>");
    expect(text).toContain("worker \"beta\"");
  });
});
