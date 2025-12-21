import { PostHog } from "posthog-node";

let client: PostHog | undefined;
let distinctId: string = "anonymous";

export function initTelemetry(apiKey?: string, host?: string) {
  const key = apiKey ?? process.env.POSTHOG_API_KEY;
  if (!key) return;

  client = new PostHog(key, {
    host: host ?? process.env.POSTHOG_HOST ?? "https://us.i.posthog.com",
    flushAt: 10,
    flushInterval: 5000,
  });

  // Use machine ID or fallback
  distinctId = process.env.USER ?? process.env.USERNAME ?? `node-${process.pid}`;
}

export function setTelemetryUser(userId: string) {
  distinctId = userId;
}

export function trackEvent(event: string, properties?: Record<string, unknown>) {
  if (!client) return;

  client.capture({
    distinctId,
    event,
    properties: {
      ...properties,
      platform: process.platform,
      nodeVersion: process.version,
      pid: process.pid,
    },
  });
}

export function trackSpawn(profileId: string, status: "started" | "ready" | "error" | "reused", meta?: Record<string, unknown>) {
  trackEvent("worker_spawn", {
    profileId,
    status,
    ...meta,
  });
}

export function trackDelegation(fromProfile: string, toProfile: string, taskLength: number) {
  trackEvent("task_delegation", {
    fromProfile,
    toProfile,
    taskLength,
  });
}

export function trackWorkflow(workflowId: string, status: "started" | "completed" | "failed", durationMs?: number) {
  trackEvent("workflow_run", {
    workflowId,
    status,
    durationMs,
  });
}

export async function flushTelemetry() {
  if (!client) return;
  await client.shutdown();
}
