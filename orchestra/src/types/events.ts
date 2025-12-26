import type { WorkerInstance, WorkerResponse } from "./worker";

/** Payload sent by workers to wake up the orchestrator */
export interface WakeupPayload {
  /** Worker ID that triggered the wakeup */
  workerId: string;
  /** Optional job ID if related to an async job */
  jobId?: string;
  /** Reason for the wakeup */
  reason: "result_ready" | "needs_attention" | "error" | "progress" | "custom";
  /** Optional summary or message */
  summary?: string;
  /** Optional structured data */
  data?: Record<string, unknown>;
  /** Timestamp when the wakeup was triggered */
  timestamp: number;
}

export interface OrchestratorEvents {
  "worker:spawned": { worker: WorkerInstance };
  "worker:ready": { worker: WorkerInstance };
  "worker:busy": { worker: WorkerInstance };
  "worker:error": { worker: WorkerInstance; error: string };
  "worker:dead": { worker: WorkerInstance };
  "worker:stopped": { worker: WorkerInstance };
  "worker:response": { worker: WorkerInstance; response: WorkerResponse };
  "worker:wakeup": { payload: WakeupPayload };
  "registry:updated": { registry: { workers: Map<string, WorkerInstance> } };
}
