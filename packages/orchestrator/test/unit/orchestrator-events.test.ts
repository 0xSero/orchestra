import { describe, expect, test } from "bun:test";
import {
  createOrchestratorEvent,
  onOrchestratorEvent,
  publishOrchestratorEvent,
  publishWorkerStatusEvent,
} from "../../src/core/orchestrator-events";
import type { WorkerInstance } from "../../src/types";

describe("orchestrator events", () => {
  test("creates a versioned event envelope", () => {
    const event = createOrchestratorEvent("orchestra.error", {
      message: "boom",
    });
    expect(event.version).toBe(1);
    expect(event.type).toBe("orchestra.error");
    expect(typeof event.id).toBe("string");
    expect(typeof event.timestamp).toBe("number");
  });

  test("publishes events to subscribers", () => {
    let seen: string | undefined;
    const off = onOrchestratorEvent((event) => {
      seen = event.type;
    });
    publishOrchestratorEvent("orchestra.error", { message: "boom" });
    off();
    expect(seen).toBe("orchestra.error");
  });

  test("publishes worker status snapshots", () => {
    const instance: WorkerInstance = {
      profile: {
        id: "worker-test",
        name: "Worker Test",
        model: "model",
        purpose: "test",
        whenToUse: "test",
      },
      status: "ready",
      port: 0,
      startedAt: new Date(),
    };

    const event = publishWorkerStatusEvent({ instance });
    expect(event.data.worker.id).toBe("worker-test");
    expect(event.data.status).toBe("ready");
  });
});
