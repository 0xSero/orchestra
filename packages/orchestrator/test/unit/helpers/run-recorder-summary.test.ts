import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { buildRunSummary } from "../../helpers/run-recorder";

describe("run recorder summary", () => {
  test("computes counts from run artifacts", async () => {
    const runDir = await mkdtemp(join(process.cwd(), ".tmp/run-summary-"));
    try {
      const events = [
        {
          type: "orchestra.workflow.step",
          data: { status: "success", warning: "warn", workerId: "worker-1" },
        },
        { type: "orchestra.error", data: { message: "boom" } },
        {
          type: "orchestra.worker.status",
          data: { worker: { id: "worker-2", warning: "warn" } },
        },
      ];
      await writeFile(
        join(runDir, "events.jsonl"),
        `${events.map((event) => JSON.stringify(event)).join("\n")}\n`,
      );

      const logs = [
        { at: 1, level: "warn", message: "warn" },
        { at: 2, level: "error", message: "error" },
      ];
      await writeFile(
        join(runDir, "orchestrator.log.jsonl"),
        `${logs.map((entry) => JSON.stringify(entry)).join("\n")}\n`,
      );

      const workerDir = join(runDir, "workers", "worker-1");
      await mkdir(workerDir, { recursive: true });
      const messages = [
        {
          parts: [
            { type: "text", text: "hi" },
            { type: "tool", tool: "stream_chunk" },
          ],
        },
        { parts: [{ type: "tool", tool: "call" }] },
      ];
      await writeFile(
        join(workerDir, "messages.json"),
        JSON.stringify(messages, null, 2),
      );

      const summary = await buildRunSummary({
        runDir,
        workflowId: "summary-test",
        testName: "summary test",
        startedAt: 10,
        finishedAt: 25,
      });

      expect(summary.events.byType["orchestra.workflow.step"]).toBe(1);
      expect(summary.events.byType["orchestra.error"]).toBe(1);
      expect(summary.logs.total).toBe(2);
      expect(summary.workers.byId["worker-1"].messages.total).toBe(2);
      expect(summary.workers.byId["worker-1"].parts.byType.tool).toBe(2);
      expect(summary.workers.byId["worker-1"].tools.byToolId.call).toBe(1);
      expect(summary.workers.byId["worker-1"].tools.byToolId.stream_chunk).toBe(
        1,
      );
      expect(summary.workers.byId["worker-2"].messages.total).toBe(0);
      expect(summary.warnings.total).toBeGreaterThan(0);
      expect(summary.errors.total).toBeGreaterThan(0);
    } finally {
      await rm(runDir, { recursive: true, force: true });
    }
  });
});
