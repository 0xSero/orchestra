import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { request } from "node:http";
import { startBridgeServer } from "../../src/core/bridge-server";
import { publishOrchestratorEvent } from "../../src/core/orchestrator-events";

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
});
