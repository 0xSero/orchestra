/**
 * Orchestrator Bridge Client
 *
 * DI-first client for interacting with the orchestrator bridge server.
 * Uses dependency injection for fetch to enable testing without module mocks.
 */

export type WorkerSnapshot = {
  id: string;
  name: string;
  status: string;
  model?: string;
  port?: number;
  serverUrl?: string;
  sessionId?: string;
  supportsVision?: boolean;
  supportsWeb?: boolean;
  lastActivity?: string;
  currentTask?: string;
  error?: string;
  warning?: string;
};

export type JobSummary = {
  total: number;
  running: number;
  succeeded: number;
  failed: number;
  canceled: number;
  oldestRunningMs?: number;
};

export type OrchestratorStatus = {
  workers: WorkerSnapshot[];
  jobs: JobSummary;
};

export type JobRecord = {
  id: string;
  workerId: string;
  message: string;
  sessionId?: string;
  requestedBy?: string;
  status: string;
  startedAt: number;
  finishedAt?: number;
  durationMs?: number;
  responseText?: string;
  error?: string;
};

export type LogEntry = {
  at: number;
  level: string;
  message: string;
};

export type OrchestratorOutput = {
  jobs: JobRecord[];
  logs: LogEntry[];
};

export type FetchOutputOptions = {
  limit?: number;
  after?: number;
};

export interface OrchestratorBridgeClient {
  fetchStatus(): Promise<OrchestratorStatus | null>;
  fetchOutput(options?: FetchOutputOptions): Promise<OrchestratorOutput | null>;
  getEventsUrl(): string;
  getBaseUrl(): string | undefined;
}

export type OrchestratorBridgeClientConfig = {
  baseUrl?: string;
  fetch?: typeof globalThis.fetch;
};

/**
 * Extracts base URL from an events URL or returns the URL as-is.
 */
export function resolveOrchestratorBaseUrl(
  eventsUrl: string | undefined,
): string | undefined {
  if (!eventsUrl) return undefined;
  const trimmed = eventsUrl.replace(/\/$/, "");
  return trimmed.replace(/\/v1\/events$/, "");
}

/**
 * Creates an orchestrator bridge client with injectable dependencies.
 */
export function createOrchestratorBridgeClient(
  config: OrchestratorBridgeClientConfig,
): OrchestratorBridgeClient {
  const fetchFn = config.fetch ?? globalThis.fetch;
  const baseUrl = config.baseUrl?.replace(/\/$/, "");

  const fetchStatus = async (): Promise<OrchestratorStatus | null> => {
    if (!baseUrl) return null;

    try {
      const response = await fetchFn(`${baseUrl}/v1/status`);
      if (!response.ok) return null;
      return (await response.json()) as OrchestratorStatus;
    } catch {
      return null;
    }
  };

  const fetchOutput = async (
    options?: FetchOutputOptions,
  ): Promise<OrchestratorOutput | null> => {
    if (!baseUrl) return null;

    try {
      const params = new URLSearchParams();
      if (options?.limit !== undefined) {
        params.set("limit", String(options.limit));
      }
      if (options?.after !== undefined) {
        params.set("after", String(options.after));
      }

      const queryString = params.toString();
      const url = queryString
        ? `${baseUrl}/v1/output?${queryString}`
        : `${baseUrl}/v1/output`;

      const response = await fetchFn(url);
      if (!response.ok) return null;
      return (await response.json()) as OrchestratorOutput;
    } catch {
      return null;
    }
  };

  const getEventsUrl = (): string => {
    return `${baseUrl}/v1/events`;
  };

  const getBaseUrl = (): string | undefined => {
    return baseUrl;
  };

  return {
    fetchStatus,
    fetchOutput,
    getEventsUrl,
    getBaseUrl,
  };
}
