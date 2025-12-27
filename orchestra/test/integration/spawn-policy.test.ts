import { describe, expect, test } from "bun:test";
import type { ToolContext } from "@opencode-ai/plugin";
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

    const ctx: ToolContext = {
      agent: "test",
      sessionID: "test-session",
      messageID: "msg",
      abort: new AbortController().signal,
    };

    await expect(core.tools.tool.spawn_worker.execute({ profileId: "qa" }, ctx)).rejects.toThrow(
      "disabled by spawnPolicy",
    );

    await core.stop();
  });
});
