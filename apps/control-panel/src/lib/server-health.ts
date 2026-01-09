/**
 * Server Health Check - Monitor opencode server status
 */

import { createSignal, onCleanup } from "solid-js";

export type ServerStatus = "checking" | "connected" | "disconnected";

export type HealthCheckResult = {
  status: ServerStatus;
  version?: string;
  error?: string;
  lastCheck: number;
};

/**
 * Check if the opencode server is running
 */
export async function checkServerHealth(baseUrl: string): Promise<HealthCheckResult> {
  const now = Date.now();
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);

    const response = await fetch(`${baseUrl}/health`, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });

    clearTimeout(timeoutId);

    if (response.ok) {
      const data = await response.json().catch(() => ({}));
      return {
        status: "connected",
        version: data.version ?? undefined,
        lastCheck: now,
      };
    }

    return {
      status: "disconnected",
      error: `Server returned ${response.status}`,
      lastCheck: now,
    };
  } catch (err) {
    return {
      status: "disconnected",
      error: err instanceof Error ? err.message : "Connection failed",
      lastCheck: now,
    };
  }
}

/**
 * Create a reactive server health monitor
 */
export function createServerHealthMonitor(baseUrl: string, intervalMs = 5000) {
  const [health, setHealth] = createSignal<HealthCheckResult>({
    status: "checking",
    lastCheck: 0,
  });

  let running = true;

  const check = async () => {
    if (!running) return;
    const result = await checkServerHealth(baseUrl);
    if (running) setHealth(result);
  };

  // Initial check
  check();

  // Periodic checks
  const interval = setInterval(check, intervalMs);

  onCleanup(() => {
    running = false;
    clearInterval(interval);
  });

  return {
    health,
    refresh: check,
  };
}

/**
 * Get the expected server ports from environment
 */
export function getExpectedPorts() {
  const openCodeUrl = import.meta.env.VITE_OPENCODE_BASE_URL ?? "http://localhost:4097";
  const orchestratorUrl = import.meta.env.VITE_ORCHESTRATOR_EVENTS_URL ?? "http://localhost:14096/v1/events";

  const openCodePort = new URL(openCodeUrl).port || "4097";
  const orchestratorPort = new URL(orchestratorUrl.replace(/\/v1\/events$/, "")).port || "14096";

  return {
    openCodeUrl,
    openCodePort: parseInt(openCodePort, 10),
    orchestratorUrl,
    orchestratorPort: parseInt(orchestratorPort, 10),
  };
}
