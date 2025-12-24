import { afterAll, describe, expect, test } from "bun:test";
import { spawnWorker, stopWorker } from "../../src/workers/spawner";
import type { WorkerProfile } from "../../src/types";

const directory = process.cwd();
const MODEL = "opencode/gpt-5-nano";

describe("permissions integration", () => {
  afterAll(async () => {
    await stopWorker("perm-check").catch(() => {});
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

      const instance = await spawnWorker(profile, { basePort: 0, timeout: 60_000, directory });
      const res = await instance.client!.config.get({ query: { directory } } as any);
      const tools = (res.data as any)?.tools ?? {};

      expect(tools.write).toBe(false);
      expect(tools.edit).toBe(false);
    },
    120_000
  );
});
