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

  test("supports status queries, capabilities, and summaries", async () => {
    const registry = new WorkerRegistry();
    const unsubscribe = registry.on("spawn", () => {});
    unsubscribe();

    const vision = buildInstance("vision");
    vision.profile.supportsVision = true;
    vision.status = "ready";
    vision.lastResult = { at: new Date(), response: "ok" };
    const web = buildInstance("web");
    web.profile.supportsWeb = true;
    web.status = "busy";

    registry.register(vision);
    registry.register(web);

    expect(registry.list().length).toBe(2);
    expect(registry.getWorkersByStatus("ready").length).toBe(1);
    expect(registry.getWorkersByCapability("vision")[0]?.profile.id).toBe("vision");
    expect(registry.getVisionWorkers()[0]?.profile.id).toBe("vision");
    expect(registry.getActiveWorkers().length).toBe(2);

    const summary = registry.getSummary({ maxWorkers: 1 });
    expect(summary).toContain("showing 1 of 2");

    const json = registry.toJSON();
    expect(json[0]?.lastResult?.at).toBeTruthy();

    const timedOut = await registry.waitForStatus("unknown", "ready", 1);
    expect(timedOut).toBe(false);

    const errors: string[] = [];
    registry.on("error", (instance) => errors.push(instance.profile.id));
    registry.updateStatus("vision", "error", "boom");
    expect(errors).toEqual(["vision"]);
  });

  test("summarizes when empty", () => {
    const registry = new WorkerRegistry();
    expect(registry.getSummary()).toContain("No workers currently registered");
  });
});
