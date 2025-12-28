import { describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { WorkerProfile } from "../../src/types";
import { createTestCoreRuntime } from "../helpers/core-runtime";

describe("core runtime helper", () => {
  test("creates and stops the runtime", async () => {
    const dir = await mkdtemp(join(tmpdir(), "orch-core-runtime-"));
    const profiles: Record<string, WorkerProfile> = {
      alpha: {
        id: "alpha",
        name: "Alpha",
        model: "opencode/gpt-5-nano",
        purpose: "test",
        whenToUse: "testing",
      },
    };

    const runtime = await createTestCoreRuntime({ profiles, directory: dir });
    expect(runtime.workers.listProfiles().length).toBe(1);

    const fakeWorker = { profile: { id: "alpha" } } as never;
    runtime.workers.listWorkers = () => [fakeWorker];
    runtime.workers.stopWorker = async () => true;

    await runtime.stop();
    await rm(dir, { recursive: true, force: true });
  });
});
