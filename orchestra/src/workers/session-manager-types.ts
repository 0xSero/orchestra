import type { WorkerForwardEvent, WorkerSessionMode } from "../types/worker";

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
  type: "session.created" | "session.activity" | "session.status" | "session.closed" | "session.error";
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
