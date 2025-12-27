import { describe, expect, test } from "bun:test";

let recorded: Array<Record<string, unknown>> = [];

const memoryDeps = {
  recordMessageMemory: async (input: Record<string, unknown>) => {
    recorded.push(input);
  },
  buildMemoryInjection: async (input: { enabled: boolean }) => {
    if (!input.enabled) return undefined;
    return "memory context";
  },
  loadNeo4jConfig: () => ({
    uri: "bolt://localhost:7687",
    username: "neo4j",
    password: "password",
  }),
};

describe("memory store", () => {
  test("does nothing when disabled", async () => {
    recorded = [];
    const { createMemoryStore } = await import("../../src/memory");
    const store = createMemoryStore({ config: { enabled: false }, deps: { memory: memoryDeps } });

    const injected = await store.inject({
      client: { session: { prompt: async () => ({}) } },
      sessionId: "session-1",
    });
    expect(injected).toBe(false);

    await store.record({ text: "hello" });
    expect(recorded.length).toBe(0);
  });

  test("injects memory context and records messages", async () => {
    recorded = [];
    const { createMemoryStore } = await import("../../src/memory");
    let promptCalled = false;
    const store = createMemoryStore({
      config: { enabled: true, autoInject: true, autoRecord: true },
      deps: {
        api: {
          project: {
            current: async () => ({ data: { id: "project-1" } }),
          },
        },
        memory: memoryDeps,
      },
    });

    await store.start();

    const injected = await store.inject({
      client: {
        session: {
          prompt: async () => {
            promptCalled = true;
            return {};
          },
        },
      },
      sessionId: "session-1",
      directory: "/tmp",
    });

    expect(injected).toBe(true);
    expect(promptCalled).toBe(true);

    await store.record({ text: "hello", sessionId: "session-1", role: "user" });
    expect(recorded.length).toBe(1);
    expect(store.getScope()).toBe("project");
    expect(store.getProjectId()).toBe("project-1");
    await store.stop();
  });

  test("returns false when prompt fails and reports health", async () => {
    const { createMemoryStore } = await import("../../src/memory");
    const store = createMemoryStore({
      config: { enabled: true, autoInject: true, autoRecord: false },
      deps: {
        api: {
          project: {
            current: async () => ({ data: { id: "project-1" } }),
          },
        },
        memory: memoryDeps,
      },
    });

    await store.start();
    const injected = await store.inject({
      client: {
        session: {
          prompt: async () => {
            throw new Error("boom");
          },
        },
      },
      sessionId: "session-1",
    });

    expect(injected).toBe(false);

    const health = await store.health();
    expect(health.info?.enabled).toBe(true);
    await store.stop();
  });
});
