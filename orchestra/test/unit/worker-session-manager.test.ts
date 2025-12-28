import { describe, expect, test } from "bun:test";
import type { TrackedSession } from "../../src/workers";
import { createSessionManager, WorkerSessionManager } from "../../src/workers/session-manager";

describe("worker session manager", () => {
  test("tracks sessions, summaries, and subscriptions", () => {
    const events: string[] = [];
    const manager = new WorkerSessionManager({
      api: {} as never,
      communication: {
        emit: (type: string) => {
          events.push(type);
        },
      } as never,
    });

    const session = manager.registerSession({
      workerId: "alpha",
      sessionId: "session-1",
      mode: "linked",
      serverUrl: "http://localhost",
    });

    const unsubscribe = manager.on((event) => events.push(event.type));
    manager.recordActivity(session.sessionId, { type: "message", summary: "hello", details: {} });
    manager.updateStatus(session.sessionId, "error", "boom");
    unsubscribe();
    manager.closeSession(session.sessionId);

    expect(manager.getSession(session.sessionId)).toBeUndefined();
    expect(manager.getSessionByWorker("alpha")).toBeUndefined();

    const summary = manager.getSummary();
    expect(summary.total).toBe(0);
    expect(summary.byStatus.error).toBe(0);
  });

  test("returns sessions by mode and status", () => {
    const manager = new WorkerSessionManager({
      api: {} as never,
      communication: { emit: () => {} } as never,
    });

    manager.registerSession({ workerId: "alpha", sessionId: "s1", mode: "linked" });
    manager.registerSession({ workerId: "beta", sessionId: "s2", mode: "child" });
    manager.updateStatus("s2", "closed");

    const summary = manager.getSummary();
    expect(summary.byMode.child).toBe(1);
    expect(summary.byStatus.closed).toBe(1);

    expect(manager.getAllSessions().length).toBe(2);
    expect(manager.getSessionsByMode("linked").length).toBe(1);
    expect(manager.getActiveSessions().length).toBe(1);
  });

  test("cleans stale sessions and ignores listener errors", () => {
    const manager = new WorkerSessionManager({
      api: {} as never,
      communication: { emit: () => {} } as never,
    });

    manager.on(() => {
      throw new Error("listener failed");
    });

    const stale = manager.registerSession({ workerId: "stale", sessionId: "s-stale", mode: "linked" });
    const closed = manager.registerSession({ workerId: "closed", sessionId: "s-closed", mode: "linked" });
    const alive = manager.registerSession({ workerId: "alive", sessionId: "s-alive", mode: "linked" });

    const sessions = (manager as unknown as { sessions: Map<string, typeof stale> }).sessions;
    const workerMap = (manager as unknown as { workerToSession: Map<string, string> }).workerToSession;

    sessions.set(stale.sessionId, { ...stale, lastActivity: new Date(Date.now() - 2 * 60 * 60 * 1000) });
    workerMap.set(stale.workerId, stale.sessionId);

    sessions.set(closed.sessionId, {
      ...closed,
      status: "closed",
      lastActivity: new Date(Date.now() - 6 * 60 * 1000),
    });
    workerMap.set(closed.workerId, closed.sessionId);

    sessions.set(alive.sessionId, { ...alive, lastActivity: new Date() });
    workerMap.set(alive.workerId, alive.sessionId);

    (manager as unknown as { cleanupStaleSessions: () => void }).cleanupStaleSessions();

    expect(manager.getSession("s-stale")).toBeUndefined();
    expect(manager.getSession("s-closed")).toBeUndefined();
    expect(manager.getSession("s-alive")).toBeDefined();
    manager.dispose();
  });

  test("evicts oldest sessions when over capacity", () => {
    const manager = new WorkerSessionManager({
      api: {} as never,
      communication: { emit: () => {} } as never,
    });

    const sessions = (manager as unknown as { sessions: Map<string, TrackedSession> }).sessions;
    const workerMap = (manager as unknown as { workerToSession: Map<string, string> }).workerToSession;

    const now = Date.now();
    for (let i = 0; i < 1001; i += 1) {
      const sessionId = `s-${i}`;
      const workerId = `w-${i}`;
      sessions.set(sessionId, {
        workerId,
        sessionId,
        mode: "linked",
        createdAt: new Date(now - i),
        lastActivity: new Date(now - i),
        status: "active",
        messageCount: 0,
        toolCount: 0,
        recentActivity: [],
      });
      workerMap.set(workerId, sessionId);
    }

    (manager as unknown as { cleanupStaleSessions: () => void }).cleanupStaleSessions();
    expect(manager.getAllSessions().length).toBe(1000);
    manager.dispose();
  });

  test("createSessionManager returns a manager instance", () => {
    const manager = createSessionManager({
      api: {} as never,
      communication: { emit: () => {} } as never,
    });
    expect(manager.getAllSessions()).toEqual([]);
    manager.dispose();
  });

  test("invokes cleanup timer callback", () => {
    const originalSetInterval = globalThis.setInterval;
    const originalClearInterval = globalThis.clearInterval;
    let cleared = false;

    globalThis.setInterval = ((handler: (...args: unknown[]) => void) => {
      handler();
      return { unref: () => {} } as unknown as ReturnType<typeof setInterval>;
    }) as typeof setInterval;
    globalThis.clearInterval = (() => {
      cleared = true;
    }) as typeof clearInterval;

    try {
      const manager = new WorkerSessionManager({
        api: {} as never,
        communication: { emit: () => {} } as never,
      });
      manager.dispose();
      expect(cleared).toBe(true);
    } finally {
      globalThis.setInterval = originalSetInterval;
      globalThis.clearInterval = originalClearInterval;
    }
  });
});
