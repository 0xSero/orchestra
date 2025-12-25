/**
 * Type-safe SDK client for the Supervisor API
 */

import type {
  Worker,
  Job,
  HealthResponse,
  WorkerProfile,
} from "./types";

export interface SupervisorClientConfig {
  baseUrl: string;
  timeout?: number;
}

export interface SpawnOptions {
  basePort: number;
  timeout: number;
  directory: string;
}

export interface SpawnResult {
  port: number;
  pid?: number;
}

export class SupervisorClient {
  private baseUrl: string;
  private timeout: number;

  constructor(config: SupervisorClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, "");
    this.timeout = config.timeout ?? 30_000;
  }

  // ===========================================================================
  // Health
  // ===========================================================================

  async health(): Promise<HealthResponse> {
    return this.request("GET", "/health");
  }

  // ===========================================================================
  // Workers
  // ===========================================================================

  async getWorkers(): Promise<Worker[]> {
    const res = await this.request<{ workers: Worker[] }>("GET", "/workers");
    return res.workers;
  }

  async getWorker(id: string): Promise<Worker | null> {
    try {
      const res = await this.request<{ worker: Worker }>("GET", `/workers/${id}/status`);
      return res.worker;
    } catch {
      return null;
    }
  }

  async ensureWorker(profile: WorkerProfile, options: SpawnOptions): Promise<SpawnResult> {
    return this.request("POST", "/workers/ensure", { profile, options });
  }

  async stopWorker(workerId: string): Promise<boolean> {
    const res = await this.request<{ ok: boolean }>("POST", "/workers/stop", { workerId });
    return res.ok;
  }

  async reap(): Promise<Worker[]> {
    const res = await this.request<{ workers: Worker[] }>("POST", "/reap");
    return res.workers;
  }

  // ===========================================================================
  // Jobs
  // ===========================================================================

  async getJobs(options?: { workerId?: string; limit?: number }): Promise<Job[]> {
    const params = new URLSearchParams();
    if (options?.workerId) params.set("workerId", options.workerId);
    if (options?.limit) params.set("limit", String(options.limit));
    const query = params.toString();
    const path = query ? `/jobs?${query}` : "/jobs";
    const res = await this.request<{ jobs: Job[] }>("GET", path);
    return res.jobs;
  }

  async getJob(id: string): Promise<Job | null> {
    try {
      const res = await this.request<{ job: Job }>("GET", `/jobs/${id}`);
      return res.job;
    } catch {
      return null;
    }
  }

  async getWorkerJobs(workerId: string, limit?: number): Promise<Job[]> {
    const params = new URLSearchParams();
    if (limit) params.set("limit", String(limit));
    const query = params.toString();
    const path = query ? `/workers/${workerId}/jobs?${query}` : `/workers/${workerId}/jobs`;
    const res = await this.request<{ jobs: Job[] }>("GET", path);
    return res.jobs;
  }

  // ===========================================================================
  // Profiles
  // ===========================================================================

  async getProfiles(): Promise<WorkerProfile[]> {
    const res = await this.request<{ profiles: WorkerProfile[] }>("GET", "/profiles");
    return res.profiles;
  }

  // ===========================================================================
  // SSE Events
  // ===========================================================================

  /**
   * Create an EventSource for SSE events.
   * Caller is responsible for closing the connection.
   */
  createEventSource(): EventSource {
    return new EventSource(`${this.baseUrl}/sse`);
  }

  // ===========================================================================
  // Internal
  // ===========================================================================

  private async request<T = unknown>(
    method: string,
    path: string,
    body?: unknown
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      if (!response.ok) {
        const text = await response.text().catch(() => "");
        throw new Error(`HTTP ${response.status}: ${text || response.statusText}`);
      }

      return response.json() as Promise<T>;
    } finally {
      clearTimeout(timeoutId);
    }
  }
}

export function createSupervisorClient(config: SupervisorClientConfig): SupervisorClient {
  return new SupervisorClient(config);
}
