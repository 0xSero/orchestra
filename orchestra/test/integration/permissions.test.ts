import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { WorkerProfile } from "../../src/types";
import { setupE2eEnv } from "../helpers/e2e-env";
import { createTestWorkerRuntime } from "../helpers/worker-runtime";

const directory = process.cwd();
const MODEL = "opencode/gpt-5-nano";

describe("permissions integration", () => {
  let runtime: Awaited<ReturnType<typeof createTestWorkerRuntime>> | undefined;
  let restoreEnv: (() => void) | undefined;

  beforeAll(async () => {
    const env = await setupE2eEnv();
    restoreEnv = env.restore;
  });

  afterAll(async () => {
    await runtime?.stop();
    restoreEnv?.();
  });

  test("filesystem read permission removes write/edit tools", async () => {
    const profile: WorkerProfile = {
      id: "perm-check",
      name: "Perm Check",
      model: MODEL,
      purpose: "Permission tests",
      whenToUse: "tests",
      permissions: {
        categories: {
          filesystem: "read",
        },
      },
    };

    runtime = await createTestWorkerRuntime({ profiles: { "perm-check": profile }, directory, timeoutMs: 120_000 });
    const instance = await runtime.workers.spawn(profile);
    const res = await instance.client!.config.get({ query: { directory } });
    const data = "data" in res ? (res as { data?: { tools?: Record<string, boolean> } }).data : undefined;
    const tools = data?.tools ?? {};

    expect(tools.write).toBe(false);
    expect(tools.edit).toBe(false);
  }, 180_000);
});
