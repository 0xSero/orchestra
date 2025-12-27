import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { WorkerProfile } from "../../../src/types";
import { createTestCoreRuntime } from "../../helpers/core-runtime";
import { setupE2eEnv } from "../../helpers/e2e-env";

const MODEL = "opencode/gpt-5-nano";

const profile: WorkerProfile = {
  id: "coder",
  name: "Coder",
  model: MODEL,
  purpose: "Writes and edits code",
  whenToUse: "Implementation tasks and code changes",
};

describe("delegateTask integration", () => {
  let core: Awaited<ReturnType<typeof createTestCoreRuntime>> | undefined;
  let restoreEnv: (() => void) | undefined;

  beforeAll(async () => {
    const env = await setupE2eEnv();
    restoreEnv = env.restore;
    core = await createTestCoreRuntime({
      profiles: { coder: profile },
      directory: process.cwd(),
      configOverrides: {
        spawnOnDemand: ["coder"],
      },
    });
  }, 120_000);

  afterAll(async () => {
    await core?.stop();
    restoreEnv?.();
  }, 120_000);

  test("auto-spawns a worker and returns a real response", async () => {
    expect(core?.workers.getWorker("coder")).toBeUndefined();

    const ctx = { agent: "test", sessionID: "test-session", messageID: "msg" };
    const result = await core!.tools.tool.delegate_task.execute(
      { task: "Reply with exactly: DELEGATE_OK", autoSpawn: true },
      ctx as any,
    );

    expect(core?.workers.getWorker("coder")).toBeTruthy();
    expect(String(result)).toContain("DELEGATE_OK");
  }, 180_000);
});
