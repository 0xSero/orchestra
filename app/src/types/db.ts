export type DbUser = {
  id: string;
  onboarded: boolean;
  onboardedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type WorkerConfig = {
  id: string;
  userId: string;
  workerId: string;
  model: string | null;
  temperature: number | null;
  maxTokens: number | null;
  enabled: boolean;
  updatedAt: string;
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
  startedAt: string | null;
  lastActivity: string | null;
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
  lastResultAt: string | null;
  lastResultJobId: string | null;
  lastResultDurationMs: number | null;
  error: string | null;
  warning: string | null;
  updatedAt: string;
};

export type DbSnapshot = {
  dbPath: string;
  user: DbUser | null;
  preferences: Record<string, string | null>;
  workerConfigs: WorkerConfig[];
  workerStates: WorkerState[];
};
