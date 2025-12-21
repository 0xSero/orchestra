import { describe, expect, test } from "bun:test";
import { registry } from "../src/core/registry";
import type { WorkerInstance } from "../src/types";

describe("registry ownership", () => {
  test("tracks and clears session ownership", () => {
    const worker: WorkerInstance = {
      profile: {
        id: "worker-a",
        name: "Worker A",
        model: "node",
        purpose: "test",
        whenToUse: "test",
      },
      status: "ready",
      port: 0,
      startedAt: new Date(),
    };

    registry.register(worker);
    registry.trackOwnership("session-1", worker.profile.id);

    expect(registry.getWorkersForSession("session-1")).toContain("worker-a");

    registry.unregister(worker.profile.id);
    expect(registry.getWorkersForSession("session-1")).not.toContain("worker-a");

    registry.trackOwnership("session-1", "worker-a");
    registry.clearSessionOwnership("session-1");
    expect(registry.getWorkersForSession("session-1")).toEqual([]);
  });

  test("does nothing when tracking without session id", () => {
    registry.trackOwnership(undefined, "worker-b");
    expect(registry.getWorkersForSession("")).toEqual([]);
  });

  test("does not duplicate worker ids per session", () => {
    registry.trackOwnership("session-dup", "worker-c");
    registry.trackOwnership("session-dup", "worker-c");
    expect(registry.getWorkersForSession("session-dup")).toEqual(["worker-c"]);
    registry.clearSessionOwnership("session-dup");
  });

  test("tracks multiple workers per session", () => {
    registry.trackOwnership("session-multi", "worker-d");
    registry.trackOwnership("session-multi", "worker-e");
    const owned = registry.getWorkersForSession("session-multi").sort();
    expect(owned).toEqual(["worker-d", "worker-e"]);
    registry.clearSessionOwnership("session-multi");
  });

  test("clears session ownership without affecting others", () => {
    registry.trackOwnership("session-a", "worker-x");
    registry.trackOwnership("session-b", "worker-y");
    registry.clearSessionOwnership("session-a");
    expect(registry.getWorkersForSession("session-a")).toEqual([]);
    expect(registry.getWorkersForSession("session-b")).toEqual(["worker-y"]);
    registry.clearSessionOwnership("session-b");
  });

  test("unregister removes worker from all sessions", () => {
    const worker: WorkerInstance = {
      profile: { id: "worker-z", name: "Worker Z", model: "node", purpose: "t", whenToUse: "t" },
      status: "ready",
      port: 0,
      startedAt: new Date(),
    };
    registry.register(worker);
    registry.trackOwnership("session-1", "worker-z");
    registry.trackOwnership("session-2", "worker-z");
    registry.unregister("worker-z");
    expect(registry.getWorkersForSession("session-1")).toEqual([]);
    expect(registry.getWorkersForSession("session-2")).toEqual([]);
  });
});
