import { afterAll, describe, expect, test } from "bun:test";
import { createTestWorkerRuntime } from "../helpers/worker-runtime";
import type { WorkerProfile } from "../../src/types";

const directory = process.cwd();
const MODEL = "opencode/gpt-5-nano";

describe("permissions integration", () => {
  let runtime: Awaited<ReturnType<typeof createTestWorkerRuntime>> | undefined;

  afterAll(async () => {
    await runtime?.stop();
  });

  test(
    "filesystem read permission removes write/edit tools",
    async () => {
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

      runtime = await createTestWorkerRuntime({ profiles: { "perm-check": profile }, directory, timeoutMs: 60_000 });
      const instance = await runtime.workers.spawn(profile);
      const res = await instance.client!.config.get({ query: { directory } } as any);
      const tools = (res.data as any)?.tools ?? {};

      expect(tools.write).toBe(false);
      expect(tools.edit).toBe(false);
    },
    120_000
  );
});
