import { describe, expect, test } from "bun:test";
import type { WorkerProfile } from "../../src/types";
import { createTestCoreRuntime } from "../helpers/core-runtime";

describe("spawn policy (tools)", () => {
  test("manual spawn blocked by policy", async () => {
    const profile: WorkerProfile = {
      id: "qa",
      name: "QA",
      model: "opencode/gpt-5-nano",
      purpose: "QA checks",
      whenToUse: "testing",
    };

    const core = await createTestCoreRuntime({
      profiles: { qa: profile },
      directory: process.cwd(),
      configOverrides: { spawnPolicy: { profiles: { qa: { allowManual: false } } } },
    });

    await expect(
      core.tools.tool.spawn_worker.execute({ profileId: "qa" } as any, {} as any)
    ).rejects.toThrow("disabled by spawnPolicy");

    await core.stop();
  });
});
