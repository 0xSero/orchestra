import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { request } from "node:http";
import { startBridgeServer } from "../../src/core/bridge-server";
import { publishOrchestratorEvent } from "../../src/core/orchestrator-events";
import { workerPool } from "../../src/core/worker-pool";
import { workerJobs } from "../../src/core/jobs";
import { setLoggerConfig } from "../../src/core/logger";

describe("bridge server streaming", () => {
  let bridge: Awaited<ReturnType<typeof startBridgeServer>> | undefined;

  beforeAll(async () => {
    bridge = await startBridgeServer();
  });

  afterAll(async () => {
    await bridge?.close().catch(() => {});
  });

  test("v1/stream/chunk accepts payloads", async () => {
    const res = await fetch(`${bridge!.url}/v1/stream/chunk`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${bridge!.token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        workerId: "worker-test",
        jobId: "job-test",
        chunk: "hello",
        final: true,
      }),
    });
    expect(res.ok).toBe(true);
    const data = (await res.json()) as { ok: boolean };
    expect(data.ok).toBe(true);
  });

  test("v1/stream returns event-stream", async () => {
    const url = new URL(`${bridge!.url}/v1/stream`);
    await new Promise<void>((resolve, reject) => {
      const req = request(
        {
          method: "GET",
          hostname: url.hostname,
          port: url.port,
          path: `${url.pathname}${url.search}`,
          headers: { authorization: `Bearer ${bridge!.token}` },
        },
        (res) => {
          const contentType = String(res.headers["content-type"] ?? "");
          expect(contentType.includes("text/event-stream")).toBe(true);
          res.destroy();
          resolve();
        },
      );
      req.on("error", reject);
      req.setTimeout(2000, () => {
        req.destroy(new Error("timeout"));
      });
      req.end();
    });
  });

  test("v1/events returns event-stream and emits events", async () => {
    const url = new URL(`${bridge!.url}/v1/events`);
    await new Promise<void>((resolve, reject) => {
      const req = request(
        {
          method: "GET",
          hostname: url.hostname,
          port: url.port,
          path: `${url.pathname}${url.search}`,
        },
        (res) => {
          const contentType = String(res.headers["content-type"] ?? "");
          expect(contentType.includes("text/event-stream")).toBe(true);

          let buffer = "";
          const timer = setTimeout(() => {
            res.destroy();
            reject(new Error("timeout"));
          }, 2000);

          res.on("data", (chunk) => {
            buffer += chunk.toString();
            if (buffer.includes("orchestra.worker.status")) {
              clearTimeout(timer);
              res.destroy();
              resolve();
            }
          });

          publishOrchestratorEvent("orchestra.worker.status", {
            worker: {
              id: "worker-test",
              name: "Worker Test",
              status: "ready",
              backend: "server",
              model: "model",
              purpose: "test",
              whenToUse: "test",
              port: 0,
              supportsVision: false,
              supportsWeb: false,
            },
            status: "ready",
          });
        },
      );
      req.on("error", reject);
      req.end();
    });
  });

  test("v1/events emits job lifecycle events", async () => {
    const url = new URL(`${bridge!.url}/v1/events`);
    const job = workerJobs.create({
      workerId: "job-events-test-worker",
      message: "Test job for events",
      sessionId: "session-job-events-test",
      requestedBy: "integration-test",
    });

    try {
      await new Promise<void>((resolve, reject) => {
        const req = request(
          {
            method: "GET",
            hostname: url.hostname,
            port: url.port,
            path: `${url.pathname}${url.search}`,
          },
          (res) => {
            const contentType = String(res.headers["content-type"] ?? "");
            expect(contentType.includes("text/event-stream")).toBe(true);

            let buffer = "";
            let createdFound = false;
            let progressFound = false;
            let completedFound = false;
            const timer = setTimeout(() => {
              res.destroy();
              reject(
                new Error(
                  `timeout - created:${createdFound} progress:${progressFound} completed:${completedFound}`,
                ),
              );
            }, 5000);

            res.on("data", (chunk) => {
              buffer += chunk.toString();
              if (buffer.includes("event: orchestra.job.created")) {
                createdFound = true;
                expect(buffer).toContain('"jobId":"' + job.id + '"');
                expect(buffer).toContain('"workerId":"job-events-test-worker"');
              }
              if (buffer.includes("event: orchestra.job.progress")) {
                progressFound = true;
              }
              if (buffer.includes("event: orchestra.job.completed")) {
                completedFound = true;
                expect(buffer).toContain('"jobId":"' + job.id + '"');
              }
              if (createdFound && progressFound && completedFound) {
                clearTimeout(timer);
                res.destroy();
                resolve();
              }
            });

            workerJobs.updateProgress(job.id, {
              message: "Step 1 of 3",
              percent: 33,
            });

            workerJobs.setResult(job.id, {
              responseText: "Job completed successfully",
            });
          },
        );
        req.on("error", reject);
        req.end();
      });
    } finally {
      workerJobs.cancel(job.id);
    }
  });
});

describe("bridge server read APIs", () => {
  let bridge: Awaited<ReturnType<typeof startBridgeServer>> | undefined;

  beforeAll(async () => {
    bridge = await startBridgeServer();
    // Enable logger for log buffer tests
    setLoggerConfig({ enabled: true, bufferSize: 100 });
  });

  afterAll(async () => {
    await bridge?.close().catch(() => {});
    setLoggerConfig({ enabled: false });
  });

  describe("GET /v1/status", () => {
    test("returns JSON with workers and jobs keys", async () => {
      const res = await fetch(`${bridge!.url}/v1/status`);
      expect(res.ok).toBe(true);
      expect(res.headers.get("content-type")).toContain("application/json");

      const data = (await res.json()) as { workers: unknown[]; jobs: unknown };
      expect(Array.isArray(data.workers)).toBe(true);
      expect(data.jobs).toBeDefined();
    });

    test("returns current workers from pool", async () => {
      // Register a mock worker instance directly
      const mockInstance = {
        profile: {
          id: "status-test-worker",
          name: "Status Test Worker",
          model: "test-model",
          purpose: "testing status endpoint",
          whenToUse: "integration tests",
          supportsVision: false,
          supportsWeb: false,
          backend: "server" as const,
        },
        status: "ready" as const,
        port: 12345,
        directory: "/tmp/test",
        startedAt: new Date(),
        lastActivity: new Date(),
      };
      workerPool.register(mockInstance as any);

      try {
        const res = await fetch(`${bridge!.url}/v1/status`);
        expect(res.ok).toBe(true);

        const data = (await res.json()) as { workers: Array<{ id: string }> };
        const found = data.workers.find((w) => w.id === "status-test-worker");
        expect(found).toBeDefined();
      } finally {
        workerPool.unregister("status-test-worker");
      }
    });

    test("returns current jobs summary", async () => {
      const job = workerJobs.create({
        workerId: "status-test-worker",
        message: "Test task for status",
        sessionId: "session-status-test",
        requestedBy: "integration-test",
      });

      try {
        const res = await fetch(`${bridge!.url}/v1/status`);
        expect(res.ok).toBe(true);

        const data = (await res.json()) as {
          jobs: { total: number; running: number };
        };
        expect(data.jobs.total).toBeGreaterThanOrEqual(1);
        expect(data.jobs.running).toBeGreaterThanOrEqual(1);
      } finally {
        workerJobs.cancel(job.id);
      }
    });

    test("has CORS header", async () => {
      const res = await fetch(`${bridge!.url}/v1/status`);
      expect(res.headers.get("access-control-allow-origin")).toBe("*");
    });
  });

  describe("GET /v1/output", () => {
    test("returns JSON with jobs and logs keys", async () => {
      const res = await fetch(`${bridge!.url}/v1/output`);
      expect(res.ok).toBe(true);
      expect(res.headers.get("content-type")).toContain("application/json");

      const data = (await res.json()) as { jobs: unknown[]; logs: unknown[] };
      expect(Array.isArray(data.jobs)).toBe(true);
      expect(Array.isArray(data.logs)).toBe(true);
    });

    test("respects limit query param", async () => {
      // Create a few jobs
      const jobs = [];
      for (let i = 0; i < 5; i++) {
        jobs.push(
          workerJobs.create({
            workerId: "output-test-worker",
            message: `Task ${i}`,
            sessionId: "session-output-test",
            requestedBy: "integration-test",
          }),
        );
      }

      try {
        const res = await fetch(`${bridge!.url}/v1/output?limit=3`);
        expect(res.ok).toBe(true);

        const data = (await res.json()) as { jobs: unknown[] };
        expect(data.jobs.length).toBeLessThanOrEqual(3);
      } finally {
        for (const job of jobs) {
          workerJobs.cancel(job.id);
        }
      }
    });

    test("respects after query param (unix ms)", async () => {
      const beforeTime = Date.now();

      // Wait a small amount
      await new Promise((r) => setTimeout(r, 10));

      const job = workerJobs.create({
        workerId: "output-after-test",
        message: "Task after timestamp",
        sessionId: "session-after-test",
        requestedBy: "integration-test",
      });

      try {
        const res = await fetch(`${bridge!.url}/v1/output?after=${beforeTime}`);
        expect(res.ok).toBe(true);

        const data = (await res.json()) as {
          jobs: Array<{ id: string; startedAt: number }>;
        };
        // All returned jobs should be after the timestamp
        for (const j of data.jobs) {
          expect(j.startedAt).toBeGreaterThanOrEqual(beforeTime);
        }
      } finally {
        workerJobs.cancel(job.id);
      }
    });

    test("returns logs from log buffer", async () => {
      // Import logger and write a log entry
      const { logger } = await import("../../src/core/logger");
      logger.info("integration-test-log-entry");

      const res = await fetch(`${bridge!.url}/v1/output`);
      expect(res.ok).toBe(true);

      const data = (await res.json()) as {
        logs: Array<{ message: string; level: string }>;
      };
      const found = data.logs.find((l) =>
        l.message.includes("integration-test-log-entry"),
      );
      expect(found).toBeDefined();
      expect(found?.level).toBe("info");
    });

    test("has CORS header", async () => {
      const res = await fetch(`${bridge!.url}/v1/output`);
      expect(res.headers.get("access-control-allow-origin")).toBe("*");
    });
  });

  describe("unknown routes", () => {
    test("returns 404 for unknown routes", async () => {
      const res = await fetch(`${bridge!.url}/v1/unknown-route`);
      expect(res.status).toBe(404);

      const data = (await res.json()) as { error: string };
      expect(data.error).toBe("not_found");
    });
  });
});
