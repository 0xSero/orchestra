import type { CommandDefinition } from "./index";
import { DEFAULT_COUNCIL_TOPIC, DEFAULT_WORKFLOW_ID, DEFAULT_WORKFLOW_TASK } from "./orchestrator-constants";
import { runWorkersCouncil } from "./orchestrator-council";
import { runMultimodalDemo } from "./orchestrator-multimodal";
import { buildStatusOutput, pickFirstString, pickWorkerId } from "./orchestrator-utils";

/** Build the orchestrator command table using the configured command prefix. */
export function createOrchestratorCommands(input: { prefix: string }): Record<string, CommandDefinition> {
  const prefix = input.prefix;
  const baseName = prefix.endsWith(".") ? prefix.slice(0, -1) : prefix;
  const statusName = `${prefix}status`;
  const spawnName = `${prefix}spawn`;
  const stopName = `${prefix}stop`;
  const demoName = `${prefix}demo`;
  const onboardName = `${prefix}onboard`;
  const helpName = `${prefix}help`;
  const listName = `${prefix}list`;
  const listWorkersName = `${prefix}list_workers`;

  const helpTarget = baseName || helpName;
  const listTarget = baseName || listName;
  const statusTarget = baseName || statusName;
  const spawnTarget = baseName || spawnName;
  const stopTarget = baseName || stopName;
  const demoTarget = baseName || demoName;
  const onboardTarget = baseName || onboardName;

  const helpCommand: CommandDefinition = {
    description: "Show available orchestrator commands",
    async execute(_ctx) {
      const lines: string[] = [
        "Orchestrator Commands",
        "",
        `/${helpTarget} help`,
        "  Show this help message",
        "",
        `/${listTarget} list`,
        "  List all running workers with their status",
        "",
        `/${statusTarget} status [json]`,
        "  Show orchestrator status (workers + profiles)",
        "",
        `/${spawnTarget} spawn <profileId>`,
        "  Spawn a worker by profile ID",
        "",
        `/${stopTarget} stop <profileId|all>`,
        "  Stop a running worker (or all workers)",
        "",
        `/${demoTarget} demo`,
        "  Run a short orchestrator demo",
        "",
        `/${onboardTarget} onboard [council|multimodal|all]`,
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
  };

  const listCommand: CommandDefinition = {
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
  };

  const statusCommand: CommandDefinition = {
    description: "Show orchestrator worker status",
    async execute(ctx) {
      const workers = ctx.deps.workers.listWorkers();
      const profiles = ctx.deps.workers.listProfiles();
      const autoSpawn = ctx.deps.config.spawn ?? [];
      const jobs = ctx.deps.workers.jobs.list();
      const queue = jobs.reduce(
        (acc, job) => {
          acc.total += 1;
          if (job.status === "running") acc.running += 1;
          if (job.status === "succeeded") acc.succeeded += 1;
          if (job.status === "failed") acc.failed += 1;
          if (job.status === "canceled") acc.canceled += 1;
          return acc;
        },
        { total: 0, running: 0, succeeded: 0, failed: 0, canceled: 0 },
      );

      const formatRaw = pickFirstString(ctx.parsed.named.format) ?? ctx.parsed.positional[0];
      const wantsJson =
        (typeof ctx.parsed.named.json === "string" && ctx.parsed.named.json !== "false") ||
        (typeof formatRaw === "string" && formatRaw.toLowerCase() === "json");

      const healthEntries = await Promise.allSettled([
        ctx.deps.api.health(),
        ctx.deps.orchestrator.health(),
        ctx.deps.workers.health(),
        ctx.deps.memory.health(),
      ]);
      const health = {
        api: healthEntries[0].status === "fulfilled" ? healthEntries[0].value : { ok: false },
        orchestrator: healthEntries[1].status === "fulfilled" ? healthEntries[1].value : { ok: false },
        workers: healthEntries[2].status === "fulfilled" ? healthEntries[2].value : { ok: false },
        memory: healthEntries[3].status === "fulfilled" ? healthEntries[3].value : { ok: false },
      };

      if (wantsJson) {
        return JSON.stringify(
          {
            workersRunning: workers.length,
            profilesTotal: profiles.length,
            workers: workers.map((worker) => ({
              id: worker.profile.id,
              name: worker.profile.name,
              model: worker.profile.model,
              status: worker.status,
              port: worker.port,
              supportsVision: worker.profile.supportsVision ?? false,
            })),
            profiles: profiles.map((profile) => ({
              id: profile.id,
              model: profile.model,
              supportsVision: profile.supportsVision ?? false,
            })),
            autoSpawn,
            queue,
            health,
          },
          null,
          2,
        );
      }

      const lines: string[] = [buildStatusOutput({ workers, profiles, autoSpawn })];
      lines.push("");
      lines.push(
        `Queue: ${queue.running} running, ${queue.succeeded} succeeded, ${queue.failed} failed, ${queue.canceled} canceled (total ${queue.total})`,
      );
      lines.push("Health:");
      lines.push(`- api: ${health.api.ok ? "ok" : "error"}`);
      lines.push(`- orchestrator: ${health.orchestrator.ok ? "ok" : "error"}`);
      lines.push(`- workers: ${health.workers.ok ? "ok" : "error"}`);
      lines.push(`- memory: ${health.memory.ok ? "ok" : "error"}`);
      return lines.join("\n");
    },
  };

  const spawnCommand: CommandDefinition = {
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
  };

  const stopCommand: CommandDefinition = {
    description: "Stop a running worker",
    usage: "<profileId|all>",
    async execute(ctx) {
      const workerId = pickWorkerId(ctx.parsed.positional, ctx.parsed.named);
      if (!workerId || workerId === "all") {
        const workers = ctx.deps.workers.listWorkers();
        if (workers.length === 0) {
          return "No workers are currently running.";
        }
        const results = await Promise.allSettled(
          workers.map((worker) => ctx.deps.workers.stopWorker(worker.profile.id)),
        );
        const stopped = results.filter((result) => result.status === "fulfilled" && result.value).length;
        const failed = results.length - stopped;
        if (failed > 0) {
          return `Stopped ${stopped}/${results.length} workers. ${failed} failed to stop.`;
        }
        return `Stopped ${stopped} workers.`;
      }

      try {
        const stopped = await ctx.deps.workers.stopWorker(workerId);
        if (!stopped) return `Worker "${workerId}" is not running.`;
        return `Stopped ${workerId}.`;
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        return `Failed to stop ${workerId}: ${error}`;
      }
    },
  };

  const demoCommand: CommandDefinition = {
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
  };

  const onboardCommand: CommandDefinition = {
    description: "Run the 5-minute onboarding flow (council + multimodal demo)",
    usage: "[council|multimodal|all] [--topic <text>] [--image <path>] [--workflow <id>]",
    async execute(ctx) {
      const modeRaw = ctx.parsed.positional[0] ?? pickFirstString(ctx.parsed.named.mode) ?? "all";
      const mode = modeRaw.toLowerCase();
      const topic =
        pickFirstString(ctx.parsed.named.topic) ??
        pickFirstString(ctx.parsed.named.task) ??
        DEFAULT_COUNCIL_TOPIC;
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
  };

  const commands: Record<string, CommandDefinition> = {
    [helpName]: helpCommand,
    [listName]: listCommand,
    [listWorkersName]: listCommand,
    [statusName]: statusCommand,
    [spawnName]: spawnCommand,
    [stopName]: stopCommand,
    [demoName]: demoCommand,
    [onboardName]: onboardCommand,
  };

  if (baseName) {
    const aliasMap: Record<string, string> = {
      help: helpName,
      list: listName,
      workers: listName,
      status: statusName,
      spawn: spawnName,
      stop: stopName,
      demo: demoName,
      onboard: onboardName,
      onboarding: onboardName,
      council: onboardName,
      multimodal: onboardName,
    };

    commands[baseName] = {
      description: "Orchestrator command router (verb-based)",
      usage: "<action> [args]",
      async execute(ctx) {
        const [verbRaw, ...rest] = ctx.parsed.positional;
        if (!verbRaw) {
          return commands[helpName].execute(ctx);
        }

        const verb = verbRaw.toLowerCase();
        const target = aliasMap[verb];
        if (!target) {
          return `Unknown action "${verb}". Try /${helpTarget} help.`;
        }

        const nextPositional = verb === "council" || verb === "multimodal" ? [verb, ...rest] : rest;
        const nextParsed = {
          ...ctx.parsed,
          positional: nextPositional,
          tokens: nextPositional,
          raw: nextPositional.join(" "),
        };

        return commands[target].execute({ ...ctx, parsed: nextParsed });
      },
    };
  }

  if (!commands.orchestra && commands[baseName]) {
    commands.orchestra = commands[baseName];
  }

  return commands;
}
