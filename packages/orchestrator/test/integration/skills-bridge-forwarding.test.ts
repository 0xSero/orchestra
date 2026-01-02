import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { startBridgeServer } from "../../src/core/bridge-server";
import {
  onOrchestratorEvent,
  type OrchestratorSkillLoadEvent,
} from "../../src/core/orchestrator-events";
import {
  clearWorkflowSkillContext,
  setWorkflowSkillContext,
} from "../../src/skills/context";

describe("skills bridge forwarding", () => {
  let bridge: Awaited<ReturnType<typeof startBridgeServer>> | undefined;

  beforeAll(async () => {
    bridge = await startBridgeServer();
  });

  afterAll(async () => {
    await bridge?.close().catch(() => {});
  });

  test("bridge enriches skill events with workflow context", async () => {
    setWorkflowSkillContext({
      workerId: "worker-test",
      runId: "run-123",
      stepId: "step-abc",
      workflowId: "workflow-test",
    });

    try {
      await new Promise<void>((resolve, reject) => {
        const off = onOrchestratorEvent((event) => {
          if (event.type !== "orchestra.skill.load.completed") return;
          try {
            const data = event.data as OrchestratorSkillLoadEvent;
            expect(data.workflow?.runId).toBe("run-123");
            expect(data.workflow?.stepId).toBe("step-abc");
            expect(data.worker?.id).toBe("worker-test");
            resolve();
          } catch (err) {
            reject(err);
          } finally {
            off();
          }
        });

        fetch(`${bridge!.url}/v1/events`, {
          method: "POST",
          headers: {
            authorization: `Bearer ${bridge!.token}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            type: "orchestra.skill.load.completed",
            data: {
              sessionId: "session-1",
              callId: "call-1",
              skillName: "docs-research",
              workerId: "worker-test",
              source: "server",
              timestamp: Date.now(),
            },
          }),
        }).catch(reject);
      });
    } finally {
      clearWorkflowSkillContext({ workerId: "worker-test" });
    }
  });
});
