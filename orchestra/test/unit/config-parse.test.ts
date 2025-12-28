import { describe, expect, test } from "bun:test";
import { parseOrchestratorConfigFile } from "../../src/config/orchestrator/parse";
import {
  parseIntegrationsSection,
  parseMemorySection,
  parseTelemetrySection,
} from "../../src/config/orchestrator/parse-extra";
import {
  asConfigArray,
  collectProfilesAndSpawn,
  parseSpawnPolicyEntry,
} from "../../src/config/orchestrator/parse-workers";
import type { OrchestratorConfigFile } from "../../src/types";

describe("config parsing", () => {
  test("parses basic orchestrator config fields", () => {
    const raw = {
      basePort: 7000,
      autoSpawn: true,
      spawnOnDemand: ["alpha"],
      spawnPolicy: {
        default: { autoSpawn: true, allowManual: false },
        profiles: {
          alpha: { onDemand: true },
        },
      },
      startupTimeout: 123,
      healthCheckInterval: 5000,
      healthCheck: { enabled: true, intervalMs: 1000, timeoutMs: 2000, maxRetries: 2 },
      modelSelection: { mode: "economical", maxCostPer1kTokens: 0.01, preferredProviders: ["opencode"] },
      modelAliases: { alias: "opencode/gpt-5-nano" },
      profiles: ["alpha"],
      workers: [{ id: "beta", model: "model-b" }],
      ui: { toasts: true, debug: true, defaultListFormat: "markdown" },
      notifications: { idle: { enabled: true, message: "Idle", title: "OpenCode", delayMs: 10 } },
    };

    const parsed = parseOrchestratorConfigFile(raw);
    expect(parsed.basePort).toBe(7000);
    expect(parsed.autoSpawn).toBe(true);
    expect(parsed.spawnOnDemand).toEqual(["alpha"]);
    expect(parsed.spawnPolicy?.default?.autoSpawn).toBe(true);
    expect(parsed.healthCheck?.enabled).toBe(true);
    expect(parsed.modelSelection?.mode).toBe("economical");
    expect(parsed.modelAliases?.alias).toBe("opencode/gpt-5-nano");
    expect(parsed.ui?.toasts).toBe(true);
  });

  test("parses spawn policy entries and config arrays", () => {
    const entry = parseSpawnPolicyEntry({ autoSpawn: true, onDemand: false, allowManual: true });
    expect(entry?.autoSpawn).toBe(true);
    expect(entry?.allowManual).toBe(true);

    const array = asConfigArray(["alpha", { id: "beta" }, 123]);
    expect(array?.length).toBe(2);
  });

  test("collects profiles and spawn list", () => {
    const input: OrchestratorConfigFile = {
      profiles: ["alpha", { id: "beta", name: "Beta", model: "m", purpose: "p", whenToUse: "w" }],
      workers: ["alpha", { id: "gamma", name: "Gamma", model: "m2", purpose: "p", whenToUse: "w" }],
    };

    const { profiles, spawn } = collectProfilesAndSpawn(input, {
      alpha: {
        id: "alpha",
        name: "Alpha",
        model: "m",
        purpose: "Test profile",
        whenToUse: "Tests",
      },
    });
    expect(Object.keys(profiles).length).toBeGreaterThan(0);
    expect(profiles.beta?.id).toBe("beta");
    expect(spawn).toEqual(["alpha", "gamma"]);
  });

  test("parses permissions, tools, tags, and compose fields", () => {
    const input: OrchestratorConfigFile = {
      profiles: [
        {
          id: "alpha",
          name: "Alpha",
          model: "m",
          purpose: "p",
          whenToUse: "w",
          tools: { toolA: true },
          tags: ["one", "two"],
          compose: ["beta"],
          permissions: {
            categories: { filesystem: "read", execution: "sandboxed", network: "localhost" },
            tools: { toolA: { enabled: true, constraints: { level: "safe" } }, toolB: { enabled: false } },
            paths: { allowed: ["./docs"], denied: ["./secret"] },
          },
        },
        {
          id: "beta",
          name: "Beta",
          model: "m2",
          purpose: "p2",
          whenToUse: "w2",
        },
      ],
    };

    const { profiles } = collectProfilesAndSpawn(input);
    const alpha = profiles.alpha!;
    expect(alpha.tools).toEqual({ toolA: true });
    expect(alpha.tags).toEqual(["one", "two"]);
    expect(alpha.compose).toEqual(["beta"]);
    expect(alpha.permissions?.categories?.filesystem).toBe("read");
    expect(alpha.permissions?.categories?.execution).toBe("sandboxed");
    expect(alpha.permissions?.categories?.network).toBe("localhost");
    expect(alpha.permissions?.tools?.toolA?.enabled).toBe(true);
    expect(alpha.permissions?.tools?.toolA?.constraints).toEqual({ level: "safe" });
    expect(alpha.permissions?.paths?.allowed).toEqual(["./docs"]);
  });

  test("parses command, pruning, workflow, and security sections", () => {
    const parsed = parseOrchestratorConfigFile({
      commands: { enabled: true, prefix: "!" },
      pruning: {
        enabled: true,
        maxToolOutputChars: 100,
        maxToolInputChars: 50,
        protectedTools: ["toolA", "toolB"],
      },
      workflows: {
        enabled: true,
        roocodeBoomerang: {
          enabled: true,
          maxSteps: 4,
          maxTaskChars: 200,
          maxCarryChars: 100,
          perStepTimeoutMs: 5000,
          steps: [{ id: "step-1", title: "Step 1", workerId: "worker", prompt: "Do it", carry: true }, { id: 123 }],
        },
      },
      security: {
        workflows: {
          maxSteps: 3,
          maxTaskChars: 150,
          maxCarryChars: 75,
          perStepTimeoutMs: 4000,
        },
      },
    });

    expect(parsed.commands?.enabled).toBe(true);
    expect(parsed.commands?.prefix).toBe("!");
    expect(parsed.pruning?.protectedTools).toEqual(["toolA", "toolB"]);
    expect(parsed.workflows?.roocodeBoomerang?.steps?.[0]?.id).toBe("step-1");
    expect(parsed.security?.workflows?.maxSteps).toBe(3);
  });

  test("parses warm pool and agent sections", () => {
    const parsed = parseOrchestratorConfigFile({
      warmPool: {
        enabled: true,
        profiles: {
          alpha: { size: 2, idleTimeoutMs: 1000 },
          beta: "invalid",
        },
      },
      agent: {
        enabled: true,
        name: "Helper",
        model: "opencode/gpt-5-nano",
        prompt: "Assist",
        mode: "primary",
        color: "blue",
        applyToBuild: true,
      },
    });

    expect(parsed.warmPool?.enabled).toBe(true);
    expect(parsed.warmPool?.profiles?.alpha?.size).toBe(2);
    expect(parsed.agent?.name).toBe("Helper");
    expect(parsed.agent?.mode).toBe("primary");
  });
});

describe("extra config sections", () => {
  test("parses memory, integrations, and telemetry sections", () => {
    const raw: Record<string, unknown> = {
      memory: {
        enabled: true,
        autoRecord: true,
        scope: "project",
        summaries: { enabled: true, sessionMaxChars: 2000 },
        trim: { maxMessagesPerSession: 50 },
        inject: { maxChars: 1000, includeGlobal: true },
      },
      integrations: {
        linear: { enabled: true, apiKey: "key", teamId: "team" },
        neo4j: { enabled: true, uri: "bolt://", username: "neo4j", password: "pw" },
        monitoring: { enabled: true, port: 9000 },
        zendesk: { subdomain: "example", apiKey: "z-key" },
      },
      telemetry: { enabled: true, apiKey: "telemetry", host: "https://telemetry" },
    };

    const partial: Partial<OrchestratorConfigFile> = {};
    parseMemorySection(raw, partial);
    parseIntegrationsSection(raw, partial);
    parseTelemetrySection(raw, partial);

    expect(partial.memory?.enabled).toBe(true);
    expect(partial.integrations?.linear?.apiKey).toBe("key");
    expect(partial.integrations?.zendesk).toEqual({ subdomain: "example", apiKey: "z-key" });
    expect(partial.telemetry?.enabled).toBe(true);
  });
});
