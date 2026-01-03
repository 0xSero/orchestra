import { describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { startRunRecorder } from "../../helpers/run-recorder";
import { publishOrchestratorEvent } from "../../../src/core/orchestrator-events";
import { logger } from "../../../src/core/logger";
import type { WorkerInstance, WorkerProfile } from "../../../src/types";

describe("run recorder", () => {
  test("writes run bundle with events, logs, worker messages, summary", async () => {
    const runRoot = await mkdtemp(join(process.cwd(), ".tmp/run-recorder-"));
    try {
      const messages = [
        {
          info: { role: "assistant" },
          parts: [
            { type: "tool", tool: "call" },
            { type: "text", text: "ok" },
          ],
        },
        { info: { role: "user" }, parts: [{ type: "text", text: "hi" }] },
      ];
      const profile: WorkerProfile = {
        id: "worker-1",
        name: "Worker 1",
        model: "opencode/gpt-5-nano",
        purpose: "test",
        whenToUse: "test",
      };
      const worker: WorkerInstance = {
        profile,
        status: "ready",
        port: 0,
        startedAt: new Date(),
        sessionId: "session-1",
        client: {
          session: {
            messages: async () => ({ data: messages }),
          },
        } as any,
      };

      const recorder = await startRunRecorder({
        workflowId: "unit-recorder",
        testName: "unit run recorder",
        runRoot,
        listWorkers: () => [worker],
      });

      publishOrchestratorEvent("orchestra.worker.status", {
        worker: {
          id: "worker-1",
          name: "Worker 1",
          status: "ready",
          backend: "server",
          model: "opencode/gpt-5-nano",
        },
        status: "ready",
      });
      publishOrchestratorEvent("orchestra.workflow.started", {
        runId: "run-1",
        workflowId: "unit-recorder",
        startedAt: Date.now(),
      });
      publishOrchestratorEvent("orchestra.workflow.step", {
        runId: "run-1",
        workflowId: "unit-recorder",
        stepId: "step-1",
        workerId: "worker-1",
        status: "success",
        startedAt: Date.now(),
        finishedAt: Date.now(),
        durationMs: 10,
        warning: "warn",
      });
      publishOrchestratorEvent("orchestra.error", { message: "boom" });

      logger.warn("log-warn");
      logger.error("log-error");

      await recorder.finalize();

      const meta = JSON.parse(
        await readFile(join(recorder.runDir, "meta.json"), "utf8"),
      );
      expect(meta.testName).toBe("unit run recorder");
      expect(meta.workflowId).toBe("unit-recorder");

      const summary = JSON.parse(
        await readFile(join(recorder.runDir, "summary.json"), "utf8"),
      );
      expect(summary.workflowId).toBe("unit-recorder");
      expect(summary.testName).toBe("unit run recorder");
      expect(summary.events.byType["orchestra.workflow.step"]).toBe(1);
      expect(summary.workers.byId["worker-1"].messages.total).toBe(2);
      expect(summary.workers.byId["worker-1"].parts.byType.tool).toBe(1);
      expect(summary.workers.byId["worker-1"].tools.byToolId.call).toBe(1);
      expect(summary.logs.total).toBeGreaterThan(0);
      expect(summary.warnings.total).toBeGreaterThan(0);
      expect(summary.errors.total).toBeGreaterThan(0);

      const events = await readFile(
        join(recorder.runDir, "events.jsonl"),
        "utf8",
      );
      expect(events.trim().length).toBeGreaterThan(0);

      const logs = await readFile(
        join(recorder.runDir, "orchestrator.log.jsonl"),
        "utf8",
      );
      expect(logs.trim().length).toBeGreaterThan(0);

      const workerMessages = JSON.parse(
        await readFile(
          join(recorder.runDir, "workers", "worker-1", "messages.json"),
          "utf8",
        ),
      );
      expect(workerMessages.length).toBe(2);
    } finally {
      await rm(runRoot, { recursive: true, force: true });
    }
  });
});
