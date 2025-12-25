/**
 * Shared types for the control panel
 * Mirrors types from the orchestrator but simplified for UI use
 */

export type WorkerStatus = "starting" | "ready" | "busy" | "error" | "stopped";

export interface WorkerProfile {
  id: string;
  name: string;
  model: string;
  purpose: string;
  whenToUse: string;
  supportsVision?: boolean;
  supportsWeb?: boolean;
  tags?: string[];
}

export interface Worker {
  id: string;
  name: string;
  model: string;
  modelResolution?: string;
  purpose: string;
  whenToUse: string;
  profile: WorkerProfile;
  status: WorkerStatus;
  port: number;
  pid?: number;
  serverUrl?: string;
  supportsVision: boolean;
  supportsWeb: boolean;
  lastActivity?: string;
  currentTask?: string;
  error?: string;
  warning?: string;
  lastResult?: {
    at: string;
    jobId?: string;
    durationMs?: number;
    response: string;
    report?: JobReport;
  };
}

export type JobStatus = "running" | "succeeded" | "failed" | "canceled";

export interface JobReport {
  summary?: string;
  details?: string;
  issues?: string[];
  notes?: string;
}

export interface Job {
  id: string;
  workerId: string;
  message: string;
  sessionId?: string;
  requestedBy?: string;
  status: JobStatus;
  startedAt: number;
  finishedAt?: number;
  durationMs?: number;
  responseText?: string;
  error?: string;
  report?: JobReport;
}

export interface StreamChunk {
  workerId: string;
  jobId?: string;
  chunk: string;
  timestamp: number;
  final?: boolean;
}

export interface HealthResponse {
  ok: boolean;
  workers: number;
}

export interface SSEEvent {
  type: string;
  data: unknown;
}

export interface SnapshotEvent {
  workers: Worker[];
  jobs: Job[];
  streams?: StreamChunk[];
}

export interface WorkerEvent {
  worker: Worker;
}

export interface StreamEvent {
  chunk: StreamChunk;
}
