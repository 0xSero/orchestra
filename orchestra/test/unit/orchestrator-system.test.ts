import { describe, expect, test } from "bun:test";
import { buildOrchestratorSystemPrompt, buildWorkerSummary } from "../../src/prompts/orchestrator-system";
import type { OrchestratorConfig, WorkerProfile } from "../../src/types";

describe("orchestrator system prompt", () => {
  test("includes profiles, running workers, and memory protocol", () => {
    const config: OrchestratorConfig = {
      basePort: 18000,
      profiles: {},
      spawn: [],
      autoSpawn: false,
      startupTimeout: 120_000,
      healthCheckInterval: 10_000,
    };
    const profiles: WorkerProfile[] = [
      {
        id: "vision",
        name: "Vision",
        model: "vision-model",
        purpose: "Analyze images",
        whenToUse: "When images are provided",
        supportsVision: true,
        supportsWeb: true,
      },
      {
        id: "disabled",
        name: "Disabled",
        model: "model",
        purpose: "",
        whenToUse: "",
        enabled: false,
      },
    ];

    const prompt = buildOrchestratorSystemPrompt({
      config,
      profiles,
      runningWorkers: [{ id: "vision", name: "Vision", status: "ready" }],
      memoryEnabled: true,
    });

    expect(prompt).toContain("<available-workers>");
    expect(prompt).toContain("vision");
    expect(prompt).toContain("[vision, web]");
    expect(prompt).toContain("<running-workers>");
    expect(prompt).toContain("Vision");
    expect(prompt).toContain("<memory-protocol>");
    expect(prompt).toContain("<vision-convention>");
  });

  test("renders empty running workers section", () => {
    const config: OrchestratorConfig = {
      basePort: 18000,
      profiles: {},
      spawn: [],
      autoSpawn: false,
      startupTimeout: 120_000,
      healthCheckInterval: 10_000,
    };
    const prompt = buildOrchestratorSystemPrompt({
      config,
      profiles: [],
      runningWorkers: [],
      memoryEnabled: false,
    });

    expect(prompt).toContain("No workers are currently running");
  });

  test("summarizes workers with limits", () => {
    const empty = buildWorkerSummary({ runningWorkers: [] });
    expect(empty).toContain("No workers currently running");

    const summary = buildWorkerSummary({
      runningWorkers: [
        { id: "a", name: "Alpha", status: "ready" },
        { id: "b", name: "Beta", status: "busy" },
      ],
      maxWorkers: 1,
    });
    expect(summary).toContain("showing 1 of 2");
    expect(summary).toContain("Alpha");
  });
});
