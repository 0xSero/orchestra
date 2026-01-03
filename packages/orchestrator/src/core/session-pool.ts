/**
 * Session Pool - Multi-session management for concurrent task execution
 *
 * Enables running multiple tasks on the same worker process by creating
 * multiple sessions. Each session is an independent execution context.
 *
 * Key features:
 * - Create new session when worker is busy
 * - Track session state (idle/busy/error)
 * - Reuse idle sessions for efficiency
 * - Parent-child session hierarchy for subagents
 * - Automatic cleanup of old sessions
 */

import type { WorkerInstance } from "../types";

export type SessionState = "idle" | "busy" | "error" | "closed";

export interface PooledSession {
  sessionId: string;
  workerId: string;
  parentSessionId?: string;
  state: SessionState;
  createdAt: Date;
  lastUsed: Date;
  currentTaskId?: string;
  currentTask?: string;
}

export interface SessionPoolConfig {
  maxSessionsPerWorker: number;
  sessionIdleTimeoutMs: number;
  reuseIdleSessions: boolean;
}

const DEFAULT_CONFIG: SessionPoolConfig = {
  maxSessionsPerWorker: 10,
  sessionIdleTimeoutMs: 300_000, // 5 minutes
  reuseIdleSessions: true,
};

export class SessionPool {
  private sessions = new Map<string, PooledSession>();
  private workerSessions = new Map<string, Set<string>>();
  private config: SessionPoolConfig;
  private cleanupInterval: ReturnType<typeof setInterval> | undefined;

  constructor(config: Partial<SessionPoolConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.startCleanupTimer();
  }

  private startCleanupTimer(): void {
    this.cleanupInterval = setInterval(() => {
      this.cleanupIdleSessions();
    }, 60_000); // Check every minute
  }

  stopCleanup(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = undefined;
    }
  }

  private cleanupIdleSessions(): void {
    const now = Date.now();
    for (const [sessionId, session] of this.sessions) {
      if (session.state === "idle") {
        const idleMs = now - session.lastUsed.getTime();
        if (idleMs > this.config.sessionIdleTimeoutMs) {
          this.removeSession(sessionId);
        }
      }
    }
  }

  /**
   * Get an available session for a worker, or indicate a new one is needed.
   * Returns null if a new session should be created.
   */
  getAvailableSession(workerId: string): PooledSession | null {
    if (!this.config.reuseIdleSessions) {
      return null;
    }

    const workerSessionIds = this.workerSessions.get(workerId);
    if (!workerSessionIds) return null;

    for (const sessionId of workerSessionIds) {
      const session = this.sessions.get(sessionId);
      if (session && session.state === "idle") {
        return session;
      }
    }

    return null;
  }

  /**
   * Check if worker has capacity for a new session
   */
  canCreateSession(workerId: string): boolean {
    const workerSessionIds = this.workerSessions.get(workerId);
    const currentCount = workerSessionIds?.size ?? 0;
    return currentCount < this.config.maxSessionsPerWorker;
  }

  /**
   * Get count of busy sessions for a worker
   */
  getBusySessionCount(workerId: string): number {
    const workerSessionIds = this.workerSessions.get(workerId);
    if (!workerSessionIds) return 0;

    let count = 0;
    for (const sessionId of workerSessionIds) {
      const session = this.sessions.get(sessionId);
      if (session && session.state === "busy") {
        count++;
      }
    }
    return count;
  }

  /**
   * Register a new session in the pool
   */
  registerSession(input: {
    sessionId: string;
    workerId: string;
    parentSessionId?: string;
    taskId?: string;
    task?: string;
  }): PooledSession {
    const session: PooledSession = {
      sessionId: input.sessionId,
      workerId: input.workerId,
      parentSessionId: input.parentSessionId,
      state: "busy",
      createdAt: new Date(),
      lastUsed: new Date(),
      currentTaskId: input.taskId,
      currentTask: input.task,
    };

    this.sessions.set(input.sessionId, session);

    let workerSessions = this.workerSessions.get(input.workerId);
    if (!workerSessions) {
      workerSessions = new Set();
      this.workerSessions.set(input.workerId, workerSessions);
    }
    workerSessions.add(input.sessionId);

    return session;
  }

  /**
   * Mark session as busy with a task
   */
  markBusy(sessionId: string, taskId?: string, task?: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    session.state = "busy";
    session.lastUsed = new Date();
    session.currentTaskId = taskId;
    session.currentTask = task?.slice(0, 140);
  }

  /**
   * Mark session as idle (available for reuse)
   */
  markIdle(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    session.state = "idle";
    session.lastUsed = new Date();
    session.currentTaskId = undefined;
    session.currentTask = undefined;
  }

  /**
   * Mark session as error
   */
  markError(sessionId: string, error?: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    session.state = "error";
    session.lastUsed = new Date();
    session.currentTask = error?.slice(0, 140);
  }

  /**
   * Remove a session from the pool
   */
  removeSession(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    this.sessions.delete(sessionId);

    const workerSessions = this.workerSessions.get(session.workerId);
    if (workerSessions) {
      workerSessions.delete(sessionId);
      if (workerSessions.size === 0) {
        this.workerSessions.delete(session.workerId);
      }
    }
  }

  /**
   * Remove all sessions for a worker
   */
  removeWorkerSessions(workerId: string): void {
    const workerSessions = this.workerSessions.get(workerId);
    if (!workerSessions) return;

    for (const sessionId of workerSessions) {
      this.sessions.delete(sessionId);
    }
    this.workerSessions.delete(workerId);
  }

  /**
   * Get session by ID
   */
  getSession(sessionId: string): PooledSession | undefined {
    return this.sessions.get(sessionId);
  }

  /**
   * Get all sessions for a worker
   */
  getWorkerSessions(workerId: string): PooledSession[] {
    const workerSessionIds = this.workerSessions.get(workerId);
    if (!workerSessionIds) return [];

    const sessions: PooledSession[] = [];
    for (const sessionId of workerSessionIds) {
      const session = this.sessions.get(sessionId);
      if (session) sessions.push(session);
    }
    return sessions;
  }

  /**
   * Get all sessions in the pool
   */
  getAllSessions(): PooledSession[] {
    return [...this.sessions.values()];
  }

  /**
   * Get pool statistics
   */
  getStats(): {
    totalSessions: number;
    busySessions: number;
    idleSessions: number;
    errorSessions: number;
    sessionsByWorker: Map<
      string,
      { total: number; busy: number; idle: number }
    >;
  } {
    const sessionsByWorker = new Map<
      string,
      { total: number; busy: number; idle: number }
    >();
    let busySessions = 0;
    let idleSessions = 0;
    let errorSessions = 0;

    for (const session of this.sessions.values()) {
      if (session.state === "busy") busySessions++;
      else if (session.state === "idle") idleSessions++;
      else if (session.state === "error") errorSessions++;

      let workerStats = sessionsByWorker.get(session.workerId);
      if (!workerStats) {
        workerStats = { total: 0, busy: 0, idle: 0 };
        sessionsByWorker.set(session.workerId, workerStats);
      }
      workerStats.total++;
      if (session.state === "busy") workerStats.busy++;
      else if (session.state === "idle") workerStats.idle++;
    }

    return {
      totalSessions: this.sessions.size,
      busySessions,
      idleSessions,
      errorSessions,
      sessionsByWorker,
    };
  }
}

// Global session pool instance
export const sessionPool = new SessionPool();

/**
 * Acquire a session for a worker - either reuse idle or create new
 */
export async function acquireSession(
  worker: WorkerInstance,
  taskId: string,
  task: string,
  parentSessionId?: string,
): Promise<{ sessionId: string; isNew: boolean }> {
  const workerId = worker.profile.id;
  const client = worker.client;

  if (!client) {
    throw new Error(`Worker "${workerId}" has no client`);
  }

  // Try to reuse an idle session
  const existingSession = sessionPool.getAvailableSession(workerId);
  if (existingSession) {
    sessionPool.markBusy(existingSession.sessionId, taskId, task);
    return { sessionId: existingSession.sessionId, isNew: false };
  }

  // Check capacity
  if (!sessionPool.canCreateSession(workerId)) {
    const stats = sessionPool.getStats().sessionsByWorker.get(workerId);
    throw new Error(
      `Worker "${workerId}" has reached maximum session limit (${stats?.total ?? 0})`,
    );
  }

  // Create new session
  const sessionResult = await client.session.create({
    body: {
      title: `Task: ${task.slice(0, 50)}`,
      ...(parentSessionId ? { parentID: parentSessionId } : {}),
    },
    query: { directory: worker.directory },
  });

  const session = sessionResult.data;
  if (!session) {
    const err = sessionResult.error as any;
    throw new Error(err?.message ?? "Failed to create session");
  }

  sessionPool.registerSession({
    sessionId: session.id,
    workerId,
    parentSessionId,
    taskId,
    task,
  });

  return { sessionId: session.id, isNew: true };
}

/**
 * Release a session after task completion
 */
export function releaseSession(sessionId: string, keepAlive = true): void {
  if (keepAlive) {
    sessionPool.markIdle(sessionId);
  } else {
    sessionPool.removeSession(sessionId);
  }
}
