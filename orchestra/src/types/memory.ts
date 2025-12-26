export type MemoryConfig = {
  enabled?: boolean;
  autoSpawn?: boolean;
  autoRecord?: boolean;
  /** Inject memory into the system prompt for each message */
  autoInject?: boolean;
  scope?: "project" | "global";
  /** Max characters stored per raw message snippet */
  maxChars?: number;
  /** Rolling summaries (session/project) */
  summaries?: {
    enabled?: boolean;
    sessionMaxChars?: number;
    projectMaxChars?: number;
  };
  /** Automatic trimming of stored message nodes */
  trim?: {
    maxMessagesPerSession?: number;
    maxMessagesPerProject?: number;
    maxMessagesGlobal?: number;
    maxProjectsGlobal?: number;
  };
  /** Memory injection limits */
  inject?: {
    maxChars?: number;
    maxEntries?: number;
    includeMessages?: boolean;
    includeSessionSummary?: boolean;
    includeProjectSummary?: boolean;
    includeGlobal?: boolean;
    maxGlobalEntries?: number;
  };
};
