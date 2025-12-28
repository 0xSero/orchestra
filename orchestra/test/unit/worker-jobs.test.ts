import { describe, expect, test } from "bun:test";
import { WorkerJobRegistry } from "../../src/workers/jobs";

describe("worker job registry", () => {
  test("creates jobs and records success", () => {
    const registry = new WorkerJobRegistry();

    const job = registry.create({ workerId: "coder", message: "ping" });
    expect(job.status).toBe("running");

    registry.setResult(job.id, { responseText: "pong" });
    const stored = registry.get(job.id)!;
    expect(stored.status).toBe("succeeded");
    expect(stored.responseText).toBe("pong");
    expect(stored.durationMs ?? 0).toBeGreaterThanOrEqual(0);
  });

  test("await resolves when job completes", async () => {
    const registry = new WorkerJobRegistry();
    const job = registry.create({ workerId: "coder", message: "ping" });

    const waiter = registry.await(job.id, { timeoutMs: 2000 });
    setTimeout(() => {
      registry.setResult(job.id, { responseText: "pong" });
    }, 10);

    const finished = await waiter;
    expect(finished.status).toBe("succeeded");
  });

  test("await returns immediately for completed jobs", async () => {
    const registry = new WorkerJobRegistry();
    const job = registry.create({ workerId: "coder", message: "ping" });
    registry.setResult(job.id, { responseText: "done" });

    const finished = await registry.await(job.id, { timeoutMs: 10 });
    expect(finished.status).toBe("succeeded");
  });

  test("attaches report data", () => {
    const registry = new WorkerJobRegistry();
    const job = registry.create({ workerId: "coder", message: "ping" });

    registry.attachReport(job.id, { summary: "done" });
    const stored = registry.get(job.id)!;
    expect(stored.report?.summary).toBe("done");
  });

  test("lists jobs and records failures", () => {
    const registry = new WorkerJobRegistry();
    const job = registry.create({ workerId: "coder", message: "ping" });

    registry.setError(job.id, { error: "boom" });
    const listed = registry.list({ workerId: "coder", limit: 1 });
    expect(listed[0]?.status).toBe("failed");
  });

  test("lists jobs without filters and sorts by recency", async () => {
    const registry = new WorkerJobRegistry();
    const first = registry.create({ workerId: "alpha", message: "one" });
    await new Promise((resolve) => setTimeout(resolve, 5));
    const second = registry.create({ workerId: "beta", message: "two" });

    const listed = registry.list();
    expect(listed[0]?.id).toBe(second.id);
    expect(listed[1]?.id).toBe(first.id);
  });

  test("await rejects on timeout", async () => {
    const registry = new WorkerJobRegistry();
    const job = registry.create({ workerId: "coder", message: "ping" });

    const originalSetTimeout = globalThis.setTimeout;
    let captured: (() => void) | undefined;
    globalThis.setTimeout = ((cb: (...args: any[]) => void) => {
      captured = cb as () => void;
      return 0 as unknown as NodeJS.Timeout;
    }) as typeof setTimeout;

    try {
      const promise = registry.await(job.id, { timeoutMs: 1 });
      if (!captured) throw new Error("Expected timeout callback to be scheduled");
      captured();
      await expect(promise).rejects.toThrow("Timed out waiting for job");
    } finally {
      globalThis.setTimeout = originalSetTimeout;
    }
  });
});
