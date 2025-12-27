import { describe, expect, test } from "bun:test";
import type { Event as OpenCodeEvent } from "@opencode-ai/sdk";
import { createCommunication } from "../../src/communication";

describe("communication service", () => {
  test("emits events and forwards SDK stream", async () => {
    const published: Array<Record<string, unknown>> = [];
    const sdkEvents: OpenCodeEvent[] = [{ type: "session.created", properties: {} } as OpenCodeEvent];

    const api = {
      tui: {
        publish: async (payload: Record<string, unknown>) => {
          published.push(payload);
          return {};
        },
      },
      event: {
        subscribe: async () => ({
          stream: (async function* () {
            for (const event of sdkEvents) {
              yield event;
            }
          })(),
        }),
      },
    };

    const comm = createCommunication({
      config: { enableSdkEvents: true },
      deps: { api: api as never },
    });

    let handled = false;
    const unsubscribe = comm.on("orchestra.worker.spawned", () => {
      handled = true;
    });

    comm.emit(
      "orchestra.worker.spawned",
      { worker: { profile: { id: "worker-1" } } as never },
      { source: "orchestrator" },
    );

    await comm.start();
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(handled).toBe(true);
    expect(published.length).toBeGreaterThan(0);

    unsubscribe();
    await comm.stop();
  });

  test("handles explicit off and subscription failures", async () => {
    const api = {
      tui: { publish: async () => ({}) },
      event: {
        subscribe: async () => {
          throw new Error("subscribe failed");
        },
      },
    };

    const comm = createCommunication({
      config: { enableSdkEvents: true },
      deps: { api: api as never },
    });

    const handler = () => {};
    comm.on("orchestra.worker.ready", handler);
    comm.off("orchestra.worker.ready", handler);

    await comm.start();
    await comm.stop();

    const commDisabled = createCommunication({
      config: { enableSdkEvents: false },
      deps: { api: api as never },
    });
    await commDisabled.start();
    const health = await commDisabled.health();
    expect(health.ok).toBe(true);
    await commDisabled.stop();
  });
});
