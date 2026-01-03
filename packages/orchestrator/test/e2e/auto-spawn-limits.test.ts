import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { taskAwait, taskStart } from "../../src/command/tasks";
import {
  setDirectory,
  setProfiles,
  setSpawnDefaults,
} from "../../src/command/state";
import { shutdownAllWorkers } from "../../src/core/runtime";
import type { WorkerProfile } from "../../src/types";
import { withRunBundle } from "../helpers/run-bundle";

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

describe("task_start auto e2e", () => {
  const runBundle = withRunBundle({
    workflowId: null,
    testName: "task_start auto e2e",
    directory: process.cwd(),
    model: MODEL,
  });

  beforeAll(async () => {
    await runBundle.start();
    setDirectory(process.cwd());
    setSpawnDefaults({ basePort: 0, timeout: 60_000 });
    setProfiles(profiles);
  });

  afterAll(async () => {
    try {
      await runBundle.finalize();
    } finally {
      await shutdownAllWorkers().catch(() => {});
    }
  });

  test("auto-spawns a worker and returns a real response", async () => {
    const ctx = { agent: "test", sessionID: "test-session", messageID: "msg" };
    const started = await taskStart.execute(
      {
        kind: "auto",
        task: "Reply with exactly: DELEGATE_OK",
        autoSpawn: true,
      },
      ctx as any,
    );
    const { taskId } = JSON.parse(String(started));
    expect(typeof taskId).toBe("string");

    const jobJson = await taskAwait.execute(
      { taskId, timeoutMs: 120_000 } as any,
      ctx as any,
    );
    const job = JSON.parse(String(jobJson));
    expect(job.id).toBe(taskId);
    expect(job.status).toBe("succeeded");
    expect(job.responseText).toContain("DELEGATE_OK");
  }, 180_000);
});
