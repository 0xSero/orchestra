import { describe, expect, test } from "bun:test";
import type { WorkerInstance, WorkerProfile } from "../../src/types";
import { WorkerRegistry } from "../../src/workers/registry";

function buildProfile(id = "tester"): WorkerProfile {
  return {
    id,
    name: "Test Worker",
    model: "opencode/gpt-5-nano",
    purpose: "Test worker",
    whenToUse: "Testing",
  };
}

function buildInstance(id = "tester"): WorkerInstance {
  return {
    profile: buildProfile(id),
    status: "starting",
    port: 0,
    startedAt: new Date(),
  };
}

describe("worker registry", () => {
  test("registers and updates workers", async () => {
    const registry = new WorkerRegistry();
    const instance = buildInstance();

    registry.register(instance);
    expect(registry.get("tester")?.profile.id).toBe("tester");

    const ready = registry.waitForStatus("tester", "ready", 1000);
    registry.updateStatus("tester", "ready");
    expect(await ready).toBe(true);

    const summary = registry.getSummary();
    expect(summary).toContain("tester");

    registry.unregister("tester");
    expect(registry.get("tester")).toBeUndefined();
  });
});
