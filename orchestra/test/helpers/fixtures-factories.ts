import type { OrchestratorConfig, WorkerProfile } from "../../src/types";
import { DEFAULT_TEST_CONFIG, DEFAULT_TEST_PROFILE } from "./fixtures-manager";

/** Build a test worker profile with optional overrides. */
export function createTestProfile(id: string, overrides?: Partial<WorkerProfile>): WorkerProfile {
  return {
    ...DEFAULT_TEST_PROFILE,
    id,
    name: `Test ${id}`,
    ...overrides,
  };
}

/** Build a test orchestrator config with optional overrides. */
export function createTestConfig(overrides?: Partial<OrchestratorConfig>): OrchestratorConfig {
  return {
    ...DEFAULT_TEST_CONFIG,
    ...overrides,
    profiles: {
      ...DEFAULT_TEST_CONFIG.profiles,
      ...overrides?.profiles,
    },
    ui: {
      ...DEFAULT_TEST_CONFIG.ui,
      ...overrides?.ui,
    },
  };
}

export type ProviderScenario =
  | "single-provider"
  | "multi-provider-conflict"
  | "vision-capable"
  | "no-credentials"
  | "tied-scores"
  | "deprecated-models";

/** Generate mock provider payloads for model resolution tests. */
export function createMockProviders(scenario: ProviderScenario): Array<{
  id: string;
  source: string;
  key?: string;
  models: Record<string, unknown>;
}> {
  switch (scenario) {
    case "single-provider":
      return [
        {
          id: "local-proxy",
          source: "config",
          models: {
            "test-model": {
              id: "test-model",
              name: "Test Model",
              capabilities: { input: { text: true } },
            },
          },
        },
      ];

    case "multi-provider-conflict":
      return [
        {
          id: "anthropic",
          source: "api",
          key: "test-key-1",
          models: {
            "claude-sonnet": {
              id: "claude-sonnet",
              name: "Claude Sonnet",
              capabilities: { input: { text: true } },
            },
          },
        },
        {
          id: "local-proxy",
          source: "config",
          models: {
            "claude-sonnet": {
              id: "claude-sonnet",
              name: "Claude Sonnet (Proxy)",
              capabilities: { input: { text: true } },
            },
          },
        },
      ];

    case "vision-capable":
      return [
        {
          id: "vision-provider",
          source: "api",
          key: "test-key",
          models: {
            "vision-1": {
              id: "vision-1",
              name: "Vision Model",
              capabilities: {
                input: { text: true, image: true },
              },
            },
          },
        },
      ];

    case "no-credentials":
      return [
        {
          id: "anthropic",
          source: "api",
          key: undefined,
          models: {
            "claude-sonnet": {
              id: "claude-sonnet",
              name: "Claude Sonnet",
            },
          },
        },
      ];

    case "tied-scores":
      return [
        {
          id: "provider-a",
          source: "config",
          models: {
            "model-a": {
              id: "model-a",
              name: "Model A",
              score: 100,
            },
            "model-b": {
              id: "model-b",
              name: "Model B",
              score: 100,
            },
          },
        },
      ];

    case "deprecated-models":
      return [
        {
          id: "provider",
          source: "api",
          key: "test-key",
          models: {
            "old-model": {
              id: "old-model",
              name: "Old Model",
              deprecated: true,
            },
            "new-model": {
              id: "new-model",
              name: "New Model",
              deprecated: false,
            },
          },
        },
      ];

    default:
      throw new Error(`Unknown provider scenario: ${scenario}`);
  }
}

/** Generate mock job entries for job registry tests. */
export function createMockJobs(
  count: number,
  options?: {
    completed?: boolean;
    olderThanHours?: number;
  },
): Array<{
  id: string;
  workerId: string;
  task: string;
  status: "pending" | "running" | "completed" | "failed";
  createdAt: string;
  completedAt?: string;
  result?: string;
}> {
  const jobs: Array<{
    id: string;
    workerId: string;
    task: string;
    status: "pending" | "running" | "completed" | "failed";
    createdAt: string;
    completedAt?: string;
    result?: string;
  }> = [];

  const now = new Date();
  const hoursOffset = options?.olderThanHours ?? 0;

  for (let i = 0; i < count; i++) {
    const createdAt = new Date(now.getTime() - (hoursOffset + i) * 60 * 60 * 1000);

    const job: {
      id: string;
      workerId: string;
      task: string;
      status: "pending" | "running" | "completed" | "failed";
      createdAt: string;
      completedAt?: string;
      result?: string;
    } = {
      id: `job-${i}`,
      workerId: `worker-${i % 3}`,
      task: `Test task ${i}`,
      status: options?.completed ? "completed" : "pending",
      createdAt: createdAt.toISOString(),
    };

    if (options?.completed) {
      job.completedAt = new Date(createdAt.getTime() + 5000).toISOString();
      job.result = `Result for task ${i}`;
    }

    jobs.push(job);
  }

  return jobs;
}
