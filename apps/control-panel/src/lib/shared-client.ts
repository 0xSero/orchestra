/**
 * Shared Client Adapter
 *
 * Provides a unified interface for accessing orchestrator and OpenCode APIs
 * that can be consumed by both control-panel and OpenBoard components.
 */

import type { OpencodeClient } from "@opencode-ai/sdk/client";
import type {
  OrchestratorBridgeClient,
  OrchestratorStatus,
  JobRecord,
} from "./orchestrator-bridge";

/**
 * Unified client interface for Orchestra apps
 */
export interface OrchestraClient {
  /** OpenCode SDK client */
  opencode: OpencodeClient;
  /** Orchestrator bridge client */
  orchestrator: OrchestratorBridgeClient;
}

/**
 * Status of the Orchestra connection
 */
export interface OrchestraConnectionStatus {
  /** OpenCode server connected */
  opencodeConnected: boolean;
  /** Orchestrator bridge connected */
  orchestratorConnected: boolean;
  /** Overall connected (both services) */
  connected: boolean;
  /** OpenCode version if available */
  version?: string;
}

/**
 * Adapter interface for consuming Orchestra data
 *
 * This interface can be implemented by both control-panel and OpenBoard
 * to share the same data access patterns.
 */
export interface OrchestraDataAdapter {
  /** Get current connection status */
  getStatus(): OrchestraConnectionStatus;

  /** Get orchestrator status snapshot */
  getOrchestratorStatus(): Promise<OrchestratorStatus | null>;

  /** Get job records */
  getJobs(): Promise<JobRecord[]>;

  /** Get a specific job */
  getJob(jobId: string): Promise<JobRecord | undefined>;

  /** Start a task (requires sessionId) */
  startTask(args: {
    sessionId: string;
    kind: "auto" | "worker" | "workflow" | "op";
    task: string;
    options?: Record<string, unknown>;
  }): Promise<{ taskId: string }>;

  /** Cancel a task (requires sessionId) */
  cancelTask(sessionId: string, taskId: string, reason?: string): Promise<boolean>;
}

/**
 * Create an Orchestra data adapter from existing clients
 */
export function createOrchestraAdapter(input: {
  opencode: OpencodeClient;
  orchestrator: OrchestratorBridgeClient;
  connected: () => boolean;
  version: () => string | null;
}): OrchestraDataAdapter {
  return {
    getStatus(): OrchestraConnectionStatus {
      const opencodeConnected = input.connected();
      // Orchestrator is connected if we can access the bridge
      const orchestratorConnected = opencodeConnected;

      return {
        opencodeConnected,
        orchestratorConnected,
        connected: opencodeConnected && orchestratorConnected,
        version: input.version() ?? undefined,
      };
    },

    async getOrchestratorStatus(): Promise<OrchestratorStatus | null> {
      return input.orchestrator.fetchStatus();
    },

    async getJobs(): Promise<JobRecord[]> {
      const output = await input.orchestrator.fetchOutput();
      return output?.jobs ?? [];
    },

    async getJob(jobId: string): Promise<JobRecord | undefined> {
      const output = await input.orchestrator.fetchOutput();
      return output?.jobs?.find((j: JobRecord) => j.id === jobId);
    },

    async startTask(args): Promise<{ taskId: string }> {
      // Use OpenCode session command to start task
      const response = await input.opencode.session.command({
        path: { id: args.sessionId },
        body: {
          command: "task_start",
          arguments: `--kind ${args.kind} --task "${args.task}"`,
        },
      });

      // Parse task ID from response
      const parts = response.data?.parts;
      if (Array.isArray(parts)) {
        for (const part of parts) {
          if (
            part &&
            typeof part === "object" &&
            "text" in part &&
            typeof part.text === "string"
          ) {
            try {
              const parsed = JSON.parse(part.text) as { taskId?: string };
              if (parsed.taskId) {
                return { taskId: parsed.taskId };
              }
            } catch {
              // Not JSON, continue
            }
          }
        }
      }

      throw new Error("Failed to get task ID from response");
    },

    async cancelTask(
      sessionId: string,
      taskId: string,
      reason?: string,
    ): Promise<boolean> {
      try {
        const args = reason
          ? `--taskId ${taskId} --reason "${reason}"`
          : `--taskId ${taskId}`;

        await input.opencode.session.command({
          path: { id: sessionId },
          body: { command: "task_cancel", arguments: args },
        });

        return true;
      } catch {
        return false;
      }
    },
  };
}

/**
 * Re-export types for convenience
 */
export type { OrchestratorStatus, JobRecord } from "./orchestrator-bridge";
