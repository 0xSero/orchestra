import { existsSync } from "node:fs";
import { resolve as resolvePath } from "node:path";
import { deflateSync } from "node:zlib";
import type { WorkerInstance, WorkerProfile } from "../types";
import type { CommandDefinition } from "./index";

function formatWorkerLine(worker: WorkerInstance): string {
  const name = worker.profile.name ? ` (${worker.profile.name})` : "";
  const port = worker.port ? ` port=${worker.port}` : "";
  const status = worker.status ? ` status=${worker.status}` : "";
  return `- ${worker.profile.id}${name}${status}${port} model=${worker.profile.model}`;
}

function formatProfileLine(profile: WorkerProfile, running: boolean): string {
  const state = running ? "running" : "idle";
  return `- ${profile.id} (${state}) model=${profile.model}`;
}

const DEMO_WORKER_ID = "glm47-vision-demo";
const DEFAULT_WORKFLOW_ID = "bug-triage";
const COUNCIL_TIMEBOX = "2 minutes";
const MULTIMODAL_TIMEBOX = "2 minutes";

const DEFAULT_COUNCIL_TOPIC =
  "Design a 5-minute onboarding path for new users. Focus on immediate value, not exhaustive coverage.";

const DEFAULT_WORKFLOW_TASK = "Triage: Settings page shows an empty state during loading; suggest a fix and risks.";

type CouncilResponse = {
  workerId: string;
  response?: string;
  error?: string;
};

function pickFirstString(value: string | string[] | undefined): string | undefined {
  if (!value) return undefined;
  return Array.isArray(value) ? value[0] : value;
}

function truncateText(input: string, maxChars = 600): string {
  if (input.length <= maxChars) return input;
  return `${input.slice(0, Math.max(0, maxChars - 3))}...`;
}

function pickCouncilWorkers(profiles: WorkerProfile[], limit = 3): string[] {
  const preferred = ["product", "architect", "coder", "reviewer", "analyst", "docs", "qa"];
  const available = new Set(profiles.map((profile) => profile.id));
  const picked = preferred.filter((id) => available.has(id)).slice(0, limit);
  if (picked.length >= limit) return picked;

  const fallback = profiles.map((profile) => profile.id).filter((id) => !picked.includes(id));
  return [...picked, ...fallback].slice(0, limit);
}

function pickSummaryWorkerId(profiles: WorkerProfile[], candidates: string[]): string | undefined {
  const byId = new Map(profiles.map((profile) => [profile.id, profile]));
  for (const id of candidates) {
    if (byId.has(id)) return id;
  }
  return profiles[0]?.id;
}

// Build a tiny in-memory PNG so the vision demo always has input.
function createSolidPngBase64(width: number, height: number, rgba: [number, number, number, number]): string {
  const rowSize = 1 + width * 4;
  const raw = Buffer.alloc(rowSize * height);
  for (let y = 0; y < height; y += 1) {
    const rowStart = y * rowSize;
    raw[rowStart] = 0;
    for (let x = 0; x < width; x += 1) {
      const offset = rowStart + 1 + x * 4;
      raw[offset] = rgba[0];
      raw[offset + 1] = rgba[1];
      raw[offset + 2] = rgba[2];
      raw[offset + 3] = rgba[3];
    }
  }

  const crcTable = new Uint32Array(256).map((_, i) => {
    let c = i;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    return c >>> 0;
  });
  const crc32 = (buf: Buffer) => {
    let crc = 0xffffffff;
    for (const b of buf) {
      crc = (crc >>> 8) ^ crcTable[(crc ^ b) & 0xff];
    }
    return (crc ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const typeBuf = Buffer.from(type, "ascii");
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
    return Buffer.concat([len, typeBuf, data, crc]);
  };

  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const idat = deflateSync(raw);
  return Buffer.concat([signature, chunk("IHDR", ihdr), chunk("IDAT", idat), chunk("IEND", Buffer.alloc(0))]).toString(
    "base64",
  );
}

function buildFallbackImage() {
  const base64 = createSolidPngBase64(64, 64, [220, 61, 45, 255]);
  return { type: "image" as const, base64, mimeType: "image/png" };
}

function formatCouncilResponses(responses: CouncilResponse[]): string {
  return responses
    .map((result) => {
      if (result.error) {
        return `- ${result.workerId}: error (${result.error})`;
      }
      return `- ${result.workerId}: ${truncateText(result.response ?? "No response")}`;
    })
    .join("\n");
}

async function runWorkersCouncil(input: {
  deps: {
    workers: {
      listProfiles: () => WorkerProfile[];
      send: (
        workerId: string,
        message: string,
        options?: { timeout?: number; from?: string },
      ) => Promise<{ success: boolean; response?: string; error?: string }>;
    };
    orchestrator: { ensureWorker: (input: { workerId: string; reason: "manual" }) => Promise<WorkerInstance> };
  };
  topic: string;
  timeoutMs: number;
}) {
  const profiles = input.deps.workers.listProfiles();
  if (profiles.length === 0) {
    return "No worker profiles are available yet. Create a few skills to run the council.";
  }

  const councilIds = pickCouncilWorkers(profiles, 3);
  const prompt = [
    `Workers Council (${COUNCIL_TIMEBOX} timebox)`,
    `Topic: ${input.topic}`,
    "",
    "Return:",
    "- 2 bullet insights",
    "- 1 risk or assumption",
    "- 1 next step",
    "Keep it under 120 words.",
  ].join("\n");

  const settled = await Promise.allSettled(
    councilIds.map(async (workerId) => {
      await input.deps.orchestrator.ensureWorker({ workerId, reason: "manual" });
      const res = await input.deps.workers.send(workerId, prompt, { timeout: input.timeoutMs, from: "onboarding" });
      if (!res.success) {
        return { workerId, error: res.error ?? "worker error" } satisfies CouncilResponse;
      }
      return { workerId, response: res.response ?? "" } satisfies CouncilResponse;
    }),
  );

  const responses: CouncilResponse[] = settled.map((result, index) => {
    const workerId = councilIds[index] ?? `worker-${index + 1}`;
    if (result.status === "fulfilled") return result.value;
    return { workerId, error: result.reason instanceof Error ? result.reason.message : String(result.reason) };
  });

  const summaryWorkerId = pickSummaryWorkerId(profiles, ["reviewer", "product", "architect", "docs", "coder"]);
  let summaryText = "";
  if (summaryWorkerId) {
    try {
      await input.deps.orchestrator.ensureWorker({ workerId: summaryWorkerId, reason: "manual" });
      const summaryPrompt = [
        "Summarize the council responses into two short sections:",
        "Consensus Summary: 2-3 bullets.",
        "Next Steps: 2-3 bullets.",
        "",
        "Council responses:",
        formatCouncilResponses(responses),
      ].join("\n");
      const res = await input.deps.workers.send(summaryWorkerId, summaryPrompt, {
        timeout: Math.min(45_000, input.timeoutMs),
        from: "onboarding",
      });
      if (res.success && res.response) summaryText = res.response;
    } catch {
      summaryText = "";
    }
  }

  const fallbackNextSteps = [
    "Pick one worker to dive deeper on the highest-confidence insight.",
    "Run a built-in workflow to see multi-step orchestration.",
    "Tune worker profiles in Settings (model, temperature, enabled).",
  ];

  const summaryBlock =
    summaryText.trim().length > 0
      ? summaryText.trim()
      : `Consensus Summary:\n- The council produced ${responses.length} viewpoints on the onboarding focus.\n\nNext Steps:\n${fallbackNextSteps.map((s) => `- ${s}`).join("\n")}`;

  return ["Workers Council Output", formatCouncilResponses(responses), "", summaryBlock].join("\n");
}

async function runMultimodalDemo(input: {
  deps: {
    workers: {
      listProfiles: () => WorkerProfile[];
      send: (
        workerId: string,
        message: string,
        options?: {
          timeout?: number;
          from?: string;
          attachments?: Array<{ type: "image"; base64?: string; path?: string; mimeType?: string }>;
        },
      ) => Promise<{ success: boolean; response?: string; error?: string }>;
    };
    orchestrator: {
      ensureWorker: (input: { workerId: string; reason: "manual" }) => Promise<WorkerInstance>;
      runWorkflow: (input: { workflowId: string; task: string }) => Promise<{
        workflowId: string;
        workflowName: string;
        steps: Array<{
          id: string;
          title: string;
          workerId: string;
          status: string;
          response?: string;
          error?: string;
        }>;
      }>;
    };
  };
  imagePath?: string;
  base64?: string;
  mimeType?: string;
  workflowId: string;
  workflowTask: string;
  timeoutMs: number;
}) {
  const profiles = input.deps.workers.listProfiles();
  const byId = new Map(profiles.map((profile) => [profile.id, profile]));
  const visionProfile =
    byId.get(DEMO_WORKER_ID) ?? profiles.find((profile) => profile.supportsVision) ?? byId.get("vision");

  if (!visionProfile) {
    return "No vision-capable worker is available. Add a vision profile to run the multimodal demo.";
  }

  const attachment =
    input.imagePath && existsSync(input.imagePath)
      ? { type: "image" as const, path: resolvePath(input.imagePath), mimeType: input.mimeType }
      : input.base64
        ? { type: "image" as const, base64: input.base64, mimeType: input.mimeType ?? "image/png" }
        : buildFallbackImage();

  await input.deps.orchestrator.ensureWorker({ workerId: visionProfile.id, reason: "manual" });
  const visionPrompt = [
    `Multimodal Demo (${MULTIMODAL_TIMEBOX} timebox)`,
    "Describe the image, call out any text, and give one actionable insight.",
  ].join("\n");
  const visionRes = await input.deps.workers.send(visionProfile.id, visionPrompt, {
    timeout: input.timeoutMs,
    from: "onboarding",
    attachments: [attachment],
  });

  let workflowOutput = "Workflow demo unavailable.";
  try {
    const workflowResult = await input.deps.orchestrator.runWorkflow({
      workflowId: input.workflowId,
      task: input.workflowTask,
    });
    const stepLines = workflowResult.steps.map((step) => {
      if (step.status === "error") {
        return `- ${step.title} (${step.workerId}): error (${step.error ?? "unknown"})`;
      }
      return `- ${step.title} (${step.workerId}): ${truncateText(step.response ?? "")}`;
    });
    workflowOutput = [`Workflow: ${workflowResult.workflowName} (${workflowResult.workflowId})`, ...stepLines].join(
      "\n",
    );
  } catch (err) {
    workflowOutput = `Workflow demo failed: ${err instanceof Error ? err.message : String(err)}`;
  }

  const visionOutput = visionRes.success
    ? truncateText(visionRes.response ?? "No vision response returned.")
    : `Vision demo failed: ${visionRes.error ?? "unknown error"}`;

  const modelLabel = visionProfile.model ? ` (model: ${visionProfile.model})` : "";

  return [`Vision Output${modelLabel}`, visionOutput, "", workflowOutput].join("\n");
}

function buildStatusOutput(input: {
  workers: WorkerInstance[];
  profiles: WorkerProfile[];
  autoSpawn: string[];
}): string {
  const runningIds = new Set(input.workers.map((worker) => worker.profile.id));
  const lines: string[] = [];

  lines.push(`Workers: ${input.workers.length} running / ${input.profiles.length} profiles`);

  if (input.workers.length > 0) {
    lines.push("Running workers:");
    for (const worker of input.workers) {
      lines.push(formatWorkerLine(worker));
    }
  }

  if (input.profiles.length > 0) {
    lines.push("Profiles:");
    for (const profile of input.profiles) {
      lines.push(formatProfileLine(profile, runningIds.has(profile.id)));
    }
  }

  if (input.autoSpawn.length > 0) {
    lines.push(`Auto-spawn: ${input.autoSpawn.join(", ")}`);
  }

  return lines.join("\n");
}

function pickWorkerId(positional: string[], named: Record<string, string | string[]>): string | undefined {
  const namedId = named.workerId ?? named.profileId ?? named.id;
  if (Array.isArray(namedId)) return namedId[0];
  if (typeof namedId === "string" && namedId.trim()) return namedId.trim();
  if (positional.length > 0) return positional[0];
  return undefined;
}

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
      async execute(ctx) {
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
