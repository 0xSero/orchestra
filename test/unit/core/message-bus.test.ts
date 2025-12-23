import { describe, expect, test } from "bun:test";
import { MessageBus } from "../../../src/core/message-bus";

describe("MessageBus", () => {
  test("stores jobId on messages and notifies listeners", () => {
    const bus = new MessageBus();
    let seen: any;

    const unsubscribe = bus.onMessage((m) => {
      seen = m;
    });

    const msg = bus.send({ from: "a", to: "b", topic: "t", jobId: "job-1", text: "hello" });
    unsubscribe();

    expect(msg.jobId).toBe("job-1");
    expect(seen?.id).toBe(msg.id);
    expect(bus.list("b").some((m) => m.jobId === "job-1" && m.text === "hello")).toBe(true);
  });

  test("dedupes terminal wakeups per job within window", () => {
    const bus = new MessageBus();
    let count = 0;
    bus.onWakeup(() => {
      count++;
    });

    const first = bus.wakeup({ workerId: "w", jobId: "j", reason: "result_ready", summary: "done", timestamp: Date.now() });
    const second = bus.wakeup({ workerId: "w", jobId: "j", reason: "result_ready", summary: "done again", timestamp: Date.now() });

    expect(second.id).toBe(first.id);
    expect(bus.getWakeupHistory({ workerId: "w" }).length).toBe(1);
    expect(count).toBe(1);
  });

  test("does not dedupe progress wakeups", () => {
    const bus = new MessageBus();
    bus.wakeup({ workerId: "w", jobId: "j", reason: "progress", summary: "1", timestamp: Date.now() });
    bus.wakeup({ workerId: "w", jobId: "j", reason: "progress", summary: "2", timestamp: Date.now() });
    expect(bus.getWakeupHistory({ workerId: "w" }).length).toBe(2);
  });

  test("hasWakeup filters by jobId and reason", () => {
    const bus = new MessageBus();
    const after = Date.now() - 1;
    bus.wakeup({ workerId: "w", jobId: "j", reason: "result_ready", timestamp: Date.now() });

    expect(bus.hasWakeup({ jobId: "j", reason: "result_ready", after })).toBe(true);
    expect(bus.hasWakeup({ jobId: "j", reason: "error", after })).toBe(false);
    expect(bus.hasWakeup({ jobId: "nope", after })).toBe(false);
  });
});
