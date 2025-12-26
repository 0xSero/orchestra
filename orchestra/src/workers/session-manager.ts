import type { WorkerSessionMode, WorkerForwardEvent } from "../types/worker";
import type { CommunicationService } from "../communication";
import type { ApiService } from "../api";

/**
 * Represents a tracked worker session with activity data.
 */
export interface TrackedSession {
  /** Worker ID */
  workerId: string;
  /** Session ID */
  sessionId: string;
  /** Session mode */
  mode: WorkerSessionMode;
  /** Parent session ID (for child sessions) */
  parentSessionId?: string;
  /** Server URL (for isolated/linked sessions) */
  serverUrl?: string;
  /** When the session was created */
  createdAt: Date;
  /** Last activity timestamp */
  lastActivity: Date;
  /** Current status */
  status: "active" | "idle" | "busy" | "error" | "closed";
  /** Message count */
  messageCount: number;
  /** Tool execution count */
  toolCount: number;
  /** Recent activity log (circular buffer) */
  recentActivity: SessionActivity[];
  /** Error if any */
  error?: string;
}

/**
 * A single activity event from a worker session.
 */
export interface SessionActivity {
  /** Unique activity ID */
  id: string;
  /** Activity type */
  type: WorkerForwardEvent;
  /** Timestamp */
  timestamp: Date;
  /** Activity summary */
  summary: string;
  /** Full details (optional) */
  details?: unknown;
}

/**
 * Event emitted when session state changes.
 */
export interface SessionManagerEvent {
  type:
    | "session.created"
    | "session.activity"
    | "session.status"
    | "session.closed"
    | "session.error";
  session: TrackedSession;
  activity?: SessionActivity;
}

export type SessionManagerEventHandler = (event: SessionManagerEvent) => void;

/**
 * Serialized session for API responses.
 */
export interface SerializedSession {
  workerId: string;
  sessionId: string;
  mode: WorkerSessionMode;
  parentSessionId?: string;
  serverUrl?: string;
  createdAt: string;
  lastActivity: string;
  status: TrackedSession["status"];
  messageCount: number;
  toolCount: number;
  recentActivityCount: number;
  error?: string;
}

const MAX_RECENT_ACTIVITY = 50;

/**
 * Central manager for tracking all worker sessions.
 * Provides a single point of visibility into all orchestrator activity.
 */
export class WorkerSessionManager {
  private sessions = new Map<string, TrackedSession>();
  private workerToSession = new Map<string, string>();
  private listeners = new Set<SessionManagerEventHandler>();
  private activityCounter = 0;

  constructor(
    private deps: {
      api: ApiService;
      communication: CommunicationService;
    }
  ) {}

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
      { source: "session-manager" }
    );

    return session;
  }

  /**
   * Record activity on a session.
   */
  recordActivity(
    sessionId: string,
    activity: Omit<SessionActivity, "id" | "timestamp">
  ): void {
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
      { source: "session-manager" }
    );
  }

  /**
   * Update session status.
   */
  updateStatus(
    sessionId: string,
    status: TrackedSession["status"],
    error?: string
  ): void {
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
      { source: "session-manager" }
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
      { source: "session-manager" }
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
    return this.getAllSessions().filter(
      (s) => s.status !== "closed" && s.status !== "error"
    );
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
