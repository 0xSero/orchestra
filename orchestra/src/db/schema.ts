/**
 * Database schema for OpenCode Orchestra
 *
 * Tables:
 * - users: Tracks onboarding status and user metadata
 * - preferences: Key-value store for user preferences
 * - worker_config: Per-worker model and settings overrides
 */

export const SCHEMA_VERSION = 2;

export const CREATE_TABLES_SQL = `
-- Users table: tracks onboarding status
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  onboarded INTEGER DEFAULT 0,
  onboarded_at TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Preferences table: key-value store for user settings
CREATE TABLE IF NOT EXISTS preferences (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  value TEXT,
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE(user_id, key)
);

-- Worker config table: per-worker model and settings
CREATE TABLE IF NOT EXISTS worker_config (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  worker_id TEXT NOT NULL,
  model TEXT,
  temperature REAL,
  max_tokens INTEGER,
  enabled INTEGER DEFAULT 1,
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE(user_id, worker_id)
);

-- Worker state table: runtime status for active workers
CREATE TABLE IF NOT EXISTS worker_state (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  worker_id TEXT NOT NULL,
  profile_name TEXT,
  model TEXT,
  server_url TEXT,
  session_id TEXT,
  ui_session_id TEXT,
  status TEXT,
  session_mode TEXT,
  parent_session_id TEXT,
  started_at TEXT,
  last_activity TEXT,
  current_task TEXT,
  last_result TEXT,
  last_result_at TEXT,
  last_result_job_id TEXT,
  last_result_duration_ms INTEGER,
  error TEXT,
  warning TEXT,
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE(user_id, worker_id)
);

-- Schema version tracking
CREATE TABLE IF NOT EXISTS schema_version (
  version INTEGER PRIMARY KEY,
  applied_at TEXT DEFAULT (datetime('now'))
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_preferences_user_key ON preferences(user_id, key);
CREATE INDEX IF NOT EXISTS idx_worker_config_user ON worker_config(user_id);
CREATE INDEX IF NOT EXISTS idx_worker_config_worker ON worker_config(worker_id);
CREATE INDEX IF NOT EXISTS idx_worker_state_user ON worker_state(user_id);
CREATE INDEX IF NOT EXISTS idx_worker_state_worker ON worker_state(worker_id);
CREATE INDEX IF NOT EXISTS idx_worker_state_session ON worker_state(session_id);
`;

export type UserRow = {
  id: string;
  onboarded: number;
  onboarded_at: string | null;
  created_at: string;
  updated_at: string;
};

export type PreferenceRow = {
  id: string;
  user_id: string;
  key: string;
  value: string | null;
  updated_at: string;
};

export type WorkerConfigRow = {
  id: string;
  user_id: string;
  worker_id: string;
  model: string | null;
  temperature: number | null;
  max_tokens: number | null;
  enabled: number;
  updated_at: string;
};

export type WorkerStateRow = {
  id: string;
  user_id: string;
  worker_id: string;
  profile_name: string | null;
  model: string | null;
  server_url: string | null;
  session_id: string | null;
  ui_session_id: string | null;
  status: string | null;
  session_mode: string | null;
  parent_session_id: string | null;
  started_at: string | null;
  last_activity: string | null;
  current_task: string | null;
  last_result: string | null;
  last_result_at: string | null;
  last_result_job_id: string | null;
  last_result_duration_ms: number | null;
  error: string | null;
  warning: string | null;
  updated_at: string;
};

export type User = {
  id: string;
  onboarded: boolean;
  onboardedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type Preference = {
  id: string;
  userId: string;
  key: string;
  value: string | null;
  updatedAt: Date;
};

export type WorkerConfig = {
  id: string;
  userId: string;
  workerId: string;
  model: string | null;
  temperature: number | null;
  maxTokens: number | null;
  enabled: boolean;
  updatedAt: Date;
};

export type WorkerState = {
  id: string;
  userId: string;
  workerId: string;
  profileName: string | null;
  model: string | null;
  serverUrl: string | null;
  sessionId: string | null;
  uiSessionId: string | null;
  status: string | null;
  sessionMode: string | null;
  parentSessionId: string | null;
  startedAt: Date | null;
  lastActivity: Date | null;
  currentTask: string | null;
  lastResult: {
    at?: string;
    jobId?: string;
    response?: string;
    report?: {
      summary?: string;
      details?: string;
      issues?: string[];
      notes?: string;
    };
    durationMs?: number;
  } | null;
  lastResultAt: Date | null;
  lastResultJobId: string | null;
  lastResultDurationMs: number | null;
  error: string | null;
  warning: string | null;
  updatedAt: Date;
};

export function rowToUser(row: UserRow): User {
  return {
    id: row.id,
    onboarded: row.onboarded === 1,
    onboardedAt: row.onboarded_at ? new Date(row.onboarded_at) : null,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

export function rowToPreference(row: PreferenceRow): Preference {
  return {
    id: row.id,
    userId: row.user_id,
    key: row.key,
    value: row.value,
    updatedAt: new Date(row.updated_at),
  };
}

export function rowToWorkerConfig(row: WorkerConfigRow): WorkerConfig {
  return {
    id: row.id,
    userId: row.user_id,
    workerId: row.worker_id,
    model: row.model,
    temperature: row.temperature,
    maxTokens: row.max_tokens,
    enabled: row.enabled === 1,
    updatedAt: new Date(row.updated_at),
  };
}

export function rowToWorkerState(row: WorkerStateRow): WorkerState {
  let parsedResult: WorkerState["lastResult"] = null;
  if (row.last_result) {
    try {
      parsedResult = JSON.parse(row.last_result) as WorkerState["lastResult"];
    } catch {
      parsedResult = null;
    }
  }
  return {
    id: row.id,
    userId: row.user_id,
    workerId: row.worker_id,
    profileName: row.profile_name,
    model: row.model,
    serverUrl: row.server_url,
    sessionId: row.session_id,
    uiSessionId: row.ui_session_id,
    status: row.status,
    sessionMode: row.session_mode,
    parentSessionId: row.parent_session_id,
    startedAt: row.started_at ? new Date(row.started_at) : null,
    lastActivity: row.last_activity ? new Date(row.last_activity) : null,
    currentTask: row.current_task,
    lastResult: parsedResult,
    lastResultAt: row.last_result_at ? new Date(row.last_result_at) : null,
    lastResultJobId: row.last_result_job_id,
    lastResultDurationMs: row.last_result_duration_ms,
    error: row.error,
    warning: row.warning,
    updatedAt: new Date(row.updated_at),
  };
}
