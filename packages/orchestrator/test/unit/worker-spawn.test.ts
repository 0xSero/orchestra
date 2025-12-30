import { afterEach, describe, expect, test } from "bun:test";
import { spawnAgentWorker } from "../../src/workers/backends/agent";
import type { WorkerProfile } from "../../src/types";
import { workerPool } from "../../src/core/worker-pool";

const createMockClient = () => {
  const calls = {
    create: [] as any[],
    fork: [] as any[],
    prompt: [] as any[],
  };

  const client = {
    session: {
      create: async (args: any) => {
        calls.create.push(args);
        return { data: { id: "session-create" } };
      },
      fork: async (args: any) => {
        calls.fork.push(args);
        return { data: { id: "session-fork" } };
      },
      prompt: async (args: any) => {
        calls.prompt.push(args);
        return { data: true };
      },
    },
  };

  return { client, calls };
};

afterEach(async () => {
  await workerPool.stopAll();
});

describe("spawnAgentWorker", () => {
  test("uses session.fork for subagent profiles", async () => {
    const { client, calls } = createMockClient();
    const profile: WorkerProfile = {
      id: "subagent-unit",
      name: "Subagent Unit",
      model: "node",
      purpose: "Test subagent spawn",
      whenToUse: "Unit test",
      kind: "subagent",
    };

    const instance = await spawnAgentWorker(profile, {
      basePort: 0,
      timeout: 1000,
      directory: process.cwd(),
      client,
      parentSessionId: "parent-session-1",
    });

    expect(calls.fork.length).toBe(1);
    expect(calls.fork[0]?.path?.id).toBe("parent-session-1");
    expect(calls.create.length).toBe(0);
    expect(instance.sessionId).toBe("session-fork");
    expect(instance.parentSessionId).toBe("parent-session-1");
  });

  test("uses session.create for agent profiles", async () => {
    const { client, calls } = createMockClient();
    const profile: WorkerProfile = {
      id: "agent-unit",
      name: "Agent Unit",
      model: "node",
      purpose: "Test agent spawn",
      whenToUse: "Unit test",
      kind: "agent",
    };

    const instance = await spawnAgentWorker(profile, {
      basePort: 0,
      timeout: 1000,
      directory: process.cwd(),
      client,
    });

    expect(calls.create.length).toBe(1);
    expect(calls.fork.length).toBe(0);
    expect(instance.sessionId).toBe("session-create");
  });
});
