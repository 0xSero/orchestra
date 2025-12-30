import { afterEach, describe, expect, test } from "bun:test";
import { spawnWorker } from "../../src/workers/spawner";
import type { WorkerProfile } from "../../src/types";
import { workerPool } from "../../src/core/worker-pool";

const createMockClient = () => {
  const calls = {
    fork: [] as any[],
    prompt: [] as any[],
  };

  const client = {
    session: {
      fork: async (args: any) => {
        calls.fork.push(args);
        return { data: { id: "child-session-1" } };
      },
      create: async (_args: any) => {
        throw new Error("session.create should not be called for subagents");
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

describe("spawnWorker subagent integration", () => {
  test("forks a child session and sends bootstrap prompt without reply", async () => {
    const { client, calls } = createMockClient();
    const profile: WorkerProfile = {
      id: "subagent-integration",
      name: "Subagent Integration",
      model: "node",
      purpose: "Integration test",
      whenToUse: "Integration test",
      kind: "subagent",
    };

    const instance = await spawnWorker(profile, {
      basePort: 0,
      timeout: 1000,
      directory: process.cwd(),
      client,
      parentSessionId: "parent-session-42",
    });

    expect(calls.fork.length).toBe(1);
    expect(calls.fork[0]?.path?.id).toBe("parent-session-42");
    expect(instance.sessionId).toBe("child-session-1");
    expect(instance.parentSessionId).toBe("parent-session-42");
    expect(calls.prompt[0]?.body?.noReply).toBe(true);
  });
});
