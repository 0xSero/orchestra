const API_BASE = "/api";

async function request<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: "Request failed" }));
    throw new Error(error.error || `HTTP ${response.status}`);
  }

  return response.json();
}

export const api = {
  workers: {
    list: () => request<{ workers: Worker[]; meta: WorkersMeta }>("/workers"),
    get: (id: string) => request<Worker>(`/workers/${id}`),
    profiles: () => request<{ profiles: Record<string, Profile> }>("/workers/profiles"),
    spawn: (profileId: string, options?: object) =>
      request<Worker>("/workers", {
        method: "POST",
        body: JSON.stringify({ profileId, options }),
      }),
    stop: (id: string) =>
      request<{ success: boolean }>(`/workers/${id}`, { method: "DELETE" }),
    message: (id: string, content: string, attachments?: unknown[]) =>
      request<{ response: string }>(`/workers/${id}/message`, {
        method: "POST",
        body: JSON.stringify({ content, attachments }),
      }),
  },
  jobs: {
    list: (workerId?: string, limit?: number) =>
      request<{ jobs: Job[]; meta: JobsMeta }>(
        `/jobs${workerId ? `?workerId=${workerId}` : ""}${limit ? `&limit=${limit}` : ""}`
      ),
    get: (id: string) => request<Job>(`/jobs/${id}`),
  },
  stream: (workerId?: string) => {
    const params = new URLSearchParams();
    if (workerId) params.set("workerId", workerId);
    return new EventSource(`${API_BASE}/stream?${params}`);
  },
};

// Types
export interface Worker {
  profile: Profile;
  status: "starting" | "ready" | "busy" | "error" | "stopped";
  port: number;
  pid?: number;
  serverUrl?: string;
  directory?: string;
  startedAt: string;
  lastActivity?: string;
  error?: string;
  warning?: string;
  currentTask?: string;
  modelResolution?: string;
  lastResult?: {
    at: string;
    jobId?: string;
    response: string;
    durationMs?: number;
  };
}

export interface Profile {
  id: string;
  name: string;
  model: string;
  purpose: string;
  whenToUse: string;
  supportsVision?: boolean;
  supportsWeb?: boolean;
}

export interface WorkersMeta {
  total: number;
  active: number;
  timestamp: number;
}

export interface Job {
  id: string;
  workerId: string;
  message: string;
  status: "running" | "succeeded" | "failed" | "canceled";
  startedAt: number;
  finishedAt?: number;
  durationMs?: number;
  responseText?: string;
  error?: string;
}

export interface JobsMeta {
  total: number;
  running: number;
  succeeded: number;
  failed: number;
}
