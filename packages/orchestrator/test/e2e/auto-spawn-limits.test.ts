import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { delegateTask } from "../../src/command/workers";
import { setDirectory, setProfiles, setSpawnDefaults } from "../../src/command/state";
import { shutdownAllWorkers } from "../../src/core/runtime";
import type { WorkerProfile } from "../../src/types";

const MODEL = process.env.OPENCODE_ORCH_E2E_MODEL ?? "opencode/gpt-5-nano";

const profiles: Record<string, WorkerProfile> = {
  coder: {
    id: "coder",
    name: "Coder",
    model: MODEL,
    purpose: "Writes and edits code",
    whenToUse: "Implementation tasks and code changes",
  },
  architect: {
    id: "architect",
    name: "Architect",
    model: MODEL,
    purpose: "Designs systems and plans",
    whenToUse: "Planning or architecture tasks",
  },
  docs: {
    id: "docs",
    name: "Docs",
    model: MODEL,
    purpose: "Documentation lookup",
    whenToUse: "Research and documentation tasks",
  },
  vision: {
    id: "vision",
    name: "Vision",
    model: MODEL,
    purpose: "Image analysis",
    whenToUse: "Image-related tasks",
    supportsVision: true,
  },
};

describe("delegateTask e2e", () => {
  beforeAll(() => {
    setDirectory(process.cwd());
    setSpawnDefaults({ basePort: 0, timeout: 60_000 });
    setProfiles(profiles);
  });

  afterAll(async () => {
    await shutdownAllWorkers().catch(() => {});
  });

  test(
    "auto-spawns a worker and returns a real response",
    async () => {
      const ctx = { agent: "test", sessionID: "test-session", messageID: "msg" };
      const result = await delegateTask.execute(
        { task: "Reply with exactly: DELEGATE_OK", autoSpawn: true },
        ctx as any
      );
      expect(String(result)).toContain("Delegated");
      expect(String(result)).toContain("DELEGATE_OK");
    },
    180_000
  );
});
