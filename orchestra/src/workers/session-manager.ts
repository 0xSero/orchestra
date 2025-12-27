import type { ApiService } from "../api";
import type { CommunicationService } from "../communication";
import type { WorkerSessionMode } from "../types/worker";
import type {
  SerializedSession,
  SessionActivity,
  SessionManagerEvent,
  SessionManagerEventHandler,
  TrackedSession,
} from "./session-manager-types";

const MAX_RECENT_ACTIVITY = 50;
/** Maximum number of sessions to track before cleanup */
const MAX_SESSIONS = 1000;
/** Session TTL in milliseconds (1 hour) - sessions inactive longer than this are cleaned up */
const SESSION_TTL_MS = 60 * 60 * 1000;
/** Cleanup interval in milliseconds (5 minutes) */
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;

/**
 * Central manager for tracking all worker sessions.
 * Provides a single point of visibility into all orchestrator activity.
 */
export class WorkerSessionManager {
  private sessions = new Map<string, TrackedSession>();
  private workerToSession = new Map<string, string>();
  private listeners = new Set<SessionManagerEventHandler>();
  private activityCounter = 0;
  private cleanupTimer: ReturnType<typeof setInterval> | undefined;

  constructor(
    private deps: {
      api: ApiService;
      communication: CommunicationService;
    },
  ) {
    // Start periodic cleanup of stale sessions
    this.cleanupTimer = setInterval(() => this.cleanupStaleSessions(), CLEANUP_INTERVAL_MS);
    // Prevent timer from keeping the process alive
    if (this.cleanupTimer.unref) {
      this.cleanupTimer.unref();
    }
  }

  /**
   * Stop the cleanup timer. Call this when shutting down.
   */
  dispose(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = undefined;
    }
  }

  /**
   * Clean up stale sessions that exceed TTL or when session count exceeds max.
   */
  private cleanupStaleSessions(): void {
    const now = Date.now();
    const sessionsToRemove: string[] = [];

    // Find sessions that exceed TTL
    for (const [sessionId, session] of this.sessions) {
      const inactiveMs = now - session.lastActivity.getTime();
      const isStale = inactiveMs > SESSION_TTL_MS;
      const isClosed = session.status === "closed" || session.status === "error";

      // Remove stale sessions or closed/error sessions older than 5 minutes
      if (isStale || (isClosed && inactiveMs > 5 * 60 * 1000)) {
        sessionsToRemove.push(sessionId);
      }
    }

    // If still over limit after TTL cleanup, remove oldest sessions
    if (this.sessions.size - sessionsToRemove.length > MAX_SESSIONS) {
      const sortedSessions = Array.from(this.sessions.entries())
        .filter(([id]) => !sessionsToRemove.includes(id))
        .sort((a, b) => a[1].lastActivity.getTime() - b[1].lastActivity.getTime());

      const excessCount = this.sessions.size - sessionsToRemove.length - MAX_SESSIONS;
      for (let i = 0; i < excessCount && i < sortedSessions.length; i++) {
        sessionsToRemove.push(sortedSessions[i][0]);
      }
    }

    // Remove sessions
    for (const sessionId of sessionsToRemove) {
      const session = this.sessions.get(sessionId);
      if (session) {
        this.sessions.delete(sessionId);
        this.workerToSession.delete(session.workerId);
      }
    }
  }

  /**
   * Register a new worker session.
   */
  registerSession(input: {
    workerId: string;
    sessionId: string;
    mode: WorkerSessionMode;
    parentSessionId?: string;
    serverUrl?: string;
  }): TrackedSession {
    const session: TrackedSession = {
      workerId: input.workerId,
      sessionId: input.sessionId,
      mode: input.mode,
      parentSessionId: input.parentSessionId,
      serverUrl: input.serverUrl,
      createdAt: new Date(),
      lastActivity: new Date(),
      status: "active",
      messageCount: 0,
      toolCount: 0,
      recentActivity: [],
    };

    this.sessions.set(input.sessionId, session);
    this.workerToSession.set(input.workerId, input.sessionId);

    this.emit({ type: "session.created", session });
    this.deps.communication.emit(
      "orchestra.session.created",
      { session: this.serializeSession(session) },
      { source: "session-manager" },
    );

    return session;
  }

  /**
   * Record activity on a session.
   */
  recordActivity(sessionId: string, activity: Omit<SessionActivity, "id" | "timestamp">): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    const fullActivity: SessionActivity = {
      ...activity,
      id: `act-${++this.activityCounter}`,
      timestamp: new Date(),
    };

    session.lastActivity = fullActivity.timestamp;
    session.recentActivity.push(fullActivity);

    // Keep circular buffer size
    if (session.recentActivity.length > MAX_RECENT_ACTIVITY) {
      session.recentActivity.shift();
    }

    // Update counts
    if (activity.type === "message") session.messageCount++;
    if (activity.type === "tool") session.toolCount++;

    this.emit({ type: "session.activity", session, activity: fullActivity });
    this.deps.communication.emit(
      "orchestra.session.activity",
      {
        sessionId,
        workerId: session.workerId,
        activity: {
          id: fullActivity.id,
          type: fullActivity.type,
          timestamp: fullActivity.timestamp.toISOString(),
          summary: fullActivity.summary,
        },
      },
      { source: "session-manager" },
    );
  }

  /**
   * Update session status.
   */
  updateStatus(sessionId: string, status: TrackedSession["status"], error?: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    session.status = status;
    session.lastActivity = new Date();
    if (error) session.error = error;

    this.emit({ type: "session.status", session });
    this.deps.communication.emit(
      "orchestra.session.status",
      {
        sessionId,
        workerId: session.workerId,
        status,
        error,
      },
      { source: "session-manager" },
    );
  }

  /**
   * Close and unregister a session.
   */
  closeSession(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    session.status = "closed";
    this.emit({ type: "session.closed", session });
    this.deps.communication.emit(
      "orchestra.session.closed",
      { sessionId, workerId: session.workerId },
      { source: "session-manager" },
    );

    this.sessions.delete(sessionId);
    this.workerToSession.delete(session.workerId);
  }

  /**
   * Get session by ID.
   */
  getSession(sessionId: string): TrackedSession | undefined {
    return this.sessions.get(sessionId);
  }

  /**
   * Get session by worker ID.
   */
  getSessionByWorker(workerId: string): TrackedSession | undefined {
    const sessionId = this.workerToSession.get(workerId);
    return sessionId ? this.sessions.get(sessionId) : undefined;
  }

  /**
   * Get all tracked sessions.
   */
  getAllSessions(): TrackedSession[] {
    return Array.from(this.sessions.values());
  }

  /**
   * Get sessions by mode.
   */
  getSessionsByMode(mode: WorkerSessionMode): TrackedSession[] {
    return this.getAllSessions().filter((s) => s.mode === mode);
  }

  /**
   * Get active sessions (not closed/error).
   */
  getActiveSessions(): TrackedSession[] {
    return this.getAllSessions().filter((s) => s.status !== "closed" && s.status !== "error");
  }

  /**
   * Get session summary for API response.
   */
  getSummary(): {
    total: number;
    byMode: Record<WorkerSessionMode, number>;
    byStatus: Record<TrackedSession["status"], number>;
    sessions: Array<SerializedSession>;
  } {
    const sessions = this.getAllSessions();
    const byMode: Record<WorkerSessionMode, number> = {
      child: 0,
      isolated: 0,
      linked: 0,
    };
    const byStatus: Record<TrackedSession["status"], number> = {
      active: 0,
      idle: 0,
      busy: 0,
      error: 0,
      closed: 0,
    };

    for (const session of sessions) {
      byMode[session.mode]++;
      byStatus[session.status]++;
    }

    return {
      total: sessions.length,
      byMode,
      byStatus,
      sessions: sessions.map((s) => this.serializeSession(s)),
    };
  }

  /**
   * Subscribe to session events.
   */
  on(handler: SessionManagerEventHandler): () => void {
    this.listeners.add(handler);
    return () => this.listeners.delete(handler);
  }

  /**
   * Serialize session for API/external use.
   */
  private serializeSession(session: TrackedSession) {
    return {
      workerId: session.workerId,
      sessionId: session.sessionId,
      mode: session.mode,
      parentSessionId: session.parentSessionId,
      serverUrl: session.serverUrl,
      createdAt: session.createdAt.toISOString(),
      lastActivity: session.lastActivity.toISOString(),
      status: session.status,
      messageCount: session.messageCount,
      toolCount: session.toolCount,
      recentActivityCount: session.recentActivity.length,
      error: session.error,
    };
  }

  private emit(event: SessionManagerEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch {
        // ignore listener errors
      }
    }
  }
}

/**
 * Create a session manager instance.
 */
export function createSessionManager(deps: {
  api: ApiService;
  communication: CommunicationService;
}): WorkerSessionManager {
  return new WorkerSessionManager(deps);
}
