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

  test("attaches report data", () => {
    const registry = new WorkerJobRegistry();
    const job = registry.create({ workerId: "coder", message: "ping" });

    registry.attachReport(job.id, { summary: "done" });
    const stored = registry.get(job.id)!;
    expect(stored.report?.summary).toBe("done");
  });
});
