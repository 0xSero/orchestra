import { afterAll, describe, expect, test } from "bun:test";
import type { WorkerProfile } from "../../src/types";
import { spawnNewWorker } from "../../src/tools/tools-workers";
import { setProfiles, setSpawnDefaults, setSpawnPolicy, setDirectory } from "../../src/tools/state";

describe("spawn policy (tools)", () => {
  afterAll(() => {
    setSpawnPolicy(undefined);
  });

  test("manual spawn blocked by policy", async () => {
    const profile: WorkerProfile = {
      id: "qa",
      name: "QA",
      model: "opencode/gpt-5-nano",
      purpose: "QA checks",
      whenToUse: "testing",
    };

    setProfiles({ qa: profile });
    setSpawnDefaults({ basePort: 0, timeout: 1000 });
    setDirectory(process.cwd());
    setSpawnPolicy({ profiles: { qa: { allowManual: false } } });

    const result = await spawnNewWorker.execute({ profileId: "qa" } as any, {} as any);
    expect(String(result)).toContain("disabled by spawnPolicy");
  });
});
