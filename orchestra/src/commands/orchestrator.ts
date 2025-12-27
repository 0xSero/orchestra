import type { CommandDefinition } from "./index";
import { DEFAULT_COUNCIL_TOPIC, DEFAULT_WORKFLOW_ID, DEFAULT_WORKFLOW_TASK } from "./orchestrator-constants";
import { runWorkersCouncil } from "./orchestrator-council";
import { runMultimodalDemo } from "./orchestrator-multimodal";
import { buildStatusOutput, pickFirstString, pickWorkerId } from "./orchestrator-utils";

/** Build the orchestrator command table using the configured command prefix. */
export function createOrchestratorCommands(input: { prefix: string }): Record<string, CommandDefinition> {
  const prefix = input.prefix;
  const statusName = `${prefix}status`;
  const spawnName = `${prefix}spawn`;
  const demoName = `${prefix}demo`;
  const onboardName = `${prefix}onboard`;
  const helpName = `${prefix}help`;
  const listWorkersName = `${prefix}list_workers`;

  return {
    [helpName]: {
      description: "Show available orchestrator commands",
      async execute(_ctx) {
        const lines: string[] = [
          "Orchestrator Commands",
          "",
          `/${helpName}`,
          "  Show this help message",
          "",
          `/${listWorkersName}`,
          "  List all running workers with their status",
          "",
          `/${statusName}`,
          "  Show orchestrator status (workers + profiles)",
          "",
          `/${spawnName} <profileId>`,
          "  Spawn a worker by profile ID",
          "",
          `/${demoName}`,
          "  Run a short orchestrator demo",
          "",
          `/${onboardName} [--mode council|multimodal|all]`,
          "  Run the 5-minute onboarding flow",
          "",
          "/vision.analyze [--path <file>] [--prompt <text>]",
          "  Analyze an image from clipboard or file",
          "",
          "/memory.record <key> <value> [--tags tag1,tag2]",
          "  Record a memory entry",
          "",
          "/memory.query <query> [--limit 10]",
          "  Query the memory graph",
        ];
        return lines.join("\n");
      },
    },
    [listWorkersName]: {
      description: "List all running workers",
      async execute(ctx) {
        const workers = ctx.deps.workers.listWorkers();

        if (workers.length === 0) {
          return "No workers are currently running.";
        }

        const lines: string[] = [`Running Workers (${workers.length})`, ""];

        for (const worker of workers) {
          const name = worker.profile.name || worker.profile.id;
          const model = worker.profile.model;
          const port = worker.port ? `port ${worker.port}` : "no port";
          const status = worker.status || "unknown";
          const vision = worker.profile.supportsVision ? " [vision]" : "";

          lines.push(`${name}`);
          lines.push(`  ID: ${worker.profile.id}`);
          lines.push(`  Model: ${model}${vision}`);
          lines.push(`  Status: ${status}`);
          lines.push(`  Port: ${port}`);
          lines.push("");
        }

        return lines.join("\n").trimEnd();
      },
    },
    [statusName]: {
      description: "Show orchestrator worker status",
      async execute(ctx) {
        const workers = ctx.deps.workers.listWorkers();
        const profiles = ctx.deps.workers.listProfiles();
        const autoSpawn = ctx.deps.config.spawn ?? [];
        return buildStatusOutput({ workers, profiles, autoSpawn });
      },
    },
    [spawnName]: {
      description: "Spawn a worker by profile ID",
      usage: "<profileId>",
      async execute(ctx) {
        const workerId = pickWorkerId(ctx.parsed.positional, ctx.parsed.named);
        if (!workerId) {
          return `Usage: /${spawnName} <profileId>`;
        }

        const profile = ctx.deps.workers.getProfile(workerId);
        if (!profile) {
          const available = ctx.deps.workers
            .listProfiles()
            .map((p) => p.id)
            .join(", ");
          return `Unknown profile "${workerId}". Available: ${available || "none"}.`;
        }

        const worker = await ctx.deps.orchestrator.ensureWorker({ workerId, reason: "manual" });
        return `Spawned ${worker.profile.id} (${worker.profile.model}) on port ${worker.port}.`;
      },
    },
    [demoName]: {
      description: "Run a short orchestrator demo",
      async execute(ctx) {
        const targets = ["vision", "docs", "memory"].filter((id) => ctx.deps.workers.getProfile(id));
        const results = await Promise.allSettled(
          targets.map((id) => ctx.deps.orchestrator.ensureWorker({ workerId: id, reason: "manual" })),
        );

        const lines: string[] = ["Spawning workers..."];
        results.forEach((result, index) => {
          const id = targets[index];
          if (!id) return;
          if (result.status === "fulfilled") {
            const name = result.value.profile.name || id;
            lines.push(`OK ${name} ready`);
          } else {
            const error = result.reason instanceof Error ? result.reason.message : String(result.reason);
            lines.push(`ERROR ${id}: ${error}`);
          }
        });

        lines.push("");
        lines.push("Try these:");
        lines.push("1. Paste a screenshot to analyze");
        lines.push("2. Ask: What does the useState hook do?");
        lines.push("3. Say: Remember that we prefer TypeScript");

        return lines.join("\n");
      },
    },
    [onboardName]: {
      description: "Run the 5-minute onboarding flow (council + multimodal demo)",
      usage: "[--mode council|multimodal|all] [--topic <text>] [--image <path>] [--workflow <id>]",
      async execute(ctx) {
        const modeRaw = pickFirstString(ctx.parsed.named.mode) ?? ctx.parsed.positional[0] ?? "all";
        const mode = modeRaw.toLowerCase();
        const topic =
          pickFirstString(ctx.parsed.named.topic) ?? pickFirstString(ctx.parsed.named.task) ?? DEFAULT_COUNCIL_TOPIC;
        const workflowId = pickFirstString(ctx.parsed.named.workflow) ?? DEFAULT_WORKFLOW_ID;
        const workflowTask =
          pickFirstString(ctx.parsed.named.workflowTask) ??
          pickFirstString(ctx.parsed.named["workflow-task"]) ??
          DEFAULT_WORKFLOW_TASK;
        const imagePath = pickFirstString(ctx.parsed.named.image);
        const base64 = pickFirstString(ctx.parsed.named.base64);
        const mimeType =
          pickFirstString(ctx.parsed.named.mime) ??
          pickFirstString(ctx.parsed.named.mimeType) ??
          pickFirstString(ctx.parsed.named["mime-type"]);

        const timeoutMs = 75_000;

        if (mode === "council") {
          return await runWorkersCouncil({ deps: ctx.deps, topic, timeoutMs });
        }
        if (mode === "multimodal") {
          return await runMultimodalDemo({
            deps: ctx.deps,
            imagePath,
            base64,
            mimeType,
            workflowId,
            workflowTask,
            timeoutMs,
          });
        }

        const council = await runWorkersCouncil({ deps: ctx.deps, topic, timeoutMs });
        const multimodal = await runMultimodalDemo({
          deps: ctx.deps,
          imagePath,
          base64,
          mimeType,
          workflowId,
          workflowTask,
          timeoutMs,
        });

        return ["Onboarding Flow (<=5 minutes)", "", council, "", multimodal].join("\n");
      },
    },
  };
}
