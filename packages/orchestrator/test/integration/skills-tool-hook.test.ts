import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { request } from "node:http";
import { startBridgeServer } from "../../src/core/bridge-server";
import { publishOrchestratorEvent } from "../../src/core/orchestrator-events";

describe("skills event streaming", () => {
  let bridge: Awaited<ReturnType<typeof startBridgeServer>> | undefined;

  beforeAll(async () => {
    bridge = await startBridgeServer();
  });

  afterAll(async () => {
    await bridge?.close().catch(() => {});
  });

  test("v1/events emits skill events", async () => {
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
            if (buffer.includes("orchestra.skill.load.started")) {
              clearTimeout(timer);
              res.destroy();
              resolve();
            }
          });

          publishOrchestratorEvent("orchestra.skill.load.started", {
            sessionId: "session-1",
            callId: "call-1",
            skillName: "docs-research",
            source: "in-process",
            timestamp: Date.now(),
          });
        },
      );
      req.on("error", reject);
      req.end();
    });
  });
});
