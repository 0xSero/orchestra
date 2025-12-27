import { describe, expect, test } from "bun:test";
import { WorkerSessionManager } from "../../src/workers/session-manager";

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
});
