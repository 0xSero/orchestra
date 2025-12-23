import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { startBridgeServer } from "../../../src/core/bridge-server";
import { messageBus } from "../../../src/core/message-bus";

describe("bridge server messaging", () => {
  let bridge: Awaited<ReturnType<typeof startBridgeServer>> | undefined;

  beforeAll(async () => {
    bridge = await startBridgeServer();
  });

  afterAll(async () => {
    await bridge?.close().catch(() => {});
  });

  test("v1/message accepts jobId and wakes orchestrator on messages to orchestrator", async () => {
    const after = Date.now() - 1;
    const res = await fetch(`${bridge!.url}/v1/message`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${bridge!.token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        from: "worker-test",
        to: "orchestrator",
        topic: "handoff",
        jobId: "job-test",
        text: "hello",
      }),
    });
    expect(res.ok).toBe(true);

    const msgs = messageBus.list("orchestrator", { after, limit: 20 });
    expect(msgs.some((m) => m.from === "worker-test" && m.jobId === "job-test" && m.topic === "handoff")).toBe(true);

    const wakeups = messageBus.getWakeupHistory({ workerId: "worker-test", after, limit: 20 });
    expect(wakeups.some((e) => e.reason === "needs_attention" && e.jobId === "job-test")).toBe(true);
  });

  test("v1/report emits a result_ready wakeup for async jobs", async () => {
    const after = Date.now() - 1;
    const res = await fetch(`${bridge!.url}/v1/report`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${bridge!.token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        workerId: "worker-test",
        jobId: "job-report",
        final: "done",
        report: { summary: "ok" },
      }),
    });
    expect(res.ok).toBe(true);

    const wakeups = messageBus.getWakeupHistory({ workerId: "worker-test", after, limit: 20 });
    expect(wakeups.some((e) => e.reason === "result_ready" && e.jobId === "job-report")).toBe(true);
  });
});
