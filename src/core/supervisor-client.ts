import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { workerPool } from "./worker-pool";
import type { WorkerProfile } from "../types";

const DEFAULT_PORT = 43145;

type EnsureRequest = {
  profile: WorkerProfile;
  options: {
    basePort: number;
    timeout: number;
    directory: string;
  };
};

function getPort(options?: { supervisorUrl?: string }): number {
  if (options?.supervisorUrl) {
    try {
      const url = new URL(options.supervisorUrl);
      const port = Number(url.port);
      if (Number.isFinite(port) && port > 0) return port;
    } catch {
      // ignore
    }
  }
  const envPort = Number(process.env.OPENCODE_ORCH_SUPERVISOR_PORT);
  if (Number.isFinite(envPort) && envPort > 0) return envPort;
  return DEFAULT_PORT;
}

function buildUrl(options?: { supervisorUrl?: string }): string {
  const env = process.env.OPENCODE_ORCH_SUPERVISOR_URL;
  if (env) return env;
  if (options?.supervisorUrl) return options.supervisorUrl;
  const port = getPort(options);
  return `http://127.0.0.1:${port}`;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`Supervisor request failed ${res.status}: ${text}`);
  }
  return (await res.json()) as T;
}

async function ping(url: string): Promise<boolean> {
  try {
    const res = await fetch(`${url}/health`);
    return res.ok;
  } catch {
    return false;
  }
}

async function startSupervisor(url: string): Promise<void> {
  const port = new URL(url).port || String(DEFAULT_PORT);
  const script = fileURLToPath(new URL("../scripts/supervisor.ts", import.meta.url));
  const child = spawn("bun", ["run", script], {
    env: {
      ...process.env,
      OPENCODE_SUPERVISOR_MODE: "1",
      OPENCODE_ORCH_SUPERVISOR_PORT: port,
    },
    stdio: "ignore",
    detached: true,
  });
  child.unref();
}

async function ensureSupervisor(url: string): Promise<void> {
  if (await ping(url)) return;
  await startSupervisor(url);
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    if (await ping(url)) return;
    await sleep(250);
  }
  throw new Error("Supervisor did not start in time");
}

export async function ensureSupervisorWorker(
  profile: WorkerProfile,
  options: { basePort: number; timeout: number; directory: string; supervisorUrl?: string }
): Promise<number | undefined> {
  if (process.env.OPENCODE_ORCH_SUPERVISOR_DISABLED === "1") return undefined;
  const url = buildUrl(options);
  await ensureSupervisor(url);
  const body: EnsureRequest = {
    profile,
    options: {
      basePort: options.basePort,
      timeout: options.timeout,
      directory: options.directory,
    },
  };
  const data = await request<{ port?: number }>(`${url}/workers/ensure`, {
    method: "POST",
    body: JSON.stringify(body),
  });
  return data.port;
}

export async function listSupervisorWorkers(options?: { supervisorUrl?: string }) {
  const url = buildUrl(options);
  const res = await request<{ workers: ReturnType<typeof workerPool.toJSON> }>(`${url}/workers`, {
    method: "GET",
  });
  return res.workers;
}

export async function pingSupervisor(options?: { supervisorUrl?: string }): Promise<boolean> {
  const url = buildUrl(options);
  return ping(url);
}
