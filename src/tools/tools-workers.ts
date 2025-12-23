import { tool } from "@opencode-ai/plugin";
import { workerPool } from "../core/worker-pool";
import { workerJobs } from "../core/jobs";
import { getProfile } from "../config/profiles";
import type { WorkerProfile } from "../types";
import { sendToWorker, spawnWorker, spawnWorkers, stopWorker } from "../workers/spawner";
import { renderMarkdownTable, toBool } from "./markdown";
import { normalizeModelInput } from "./normalize-model";
import { getClient, getDefaultListFormat, getDirectory, getProfiles, getSpawnDefaults, type ToolContext } from "./state";

export const listWorkers = tool({
  description: "List all available workers in the orchestrator registry, or get detailed info for a specific worker",
  args: {
    workerId: tool.schema.string().optional().describe("If provided, show detailed info for this specific worker"),
    format: tool.schema.enum(["markdown", "json"]).optional().describe("Output format (default: markdown)"),
  },
  async execute(args) {
    const format: "markdown" | "json" = args.format ?? getDefaultListFormat();

    if (args.workerId) {
      const instance = workerPool.get(args.workerId);
      if (!instance) {
        return `Worker "${args.workerId}" not found. Use list_workers() to see available workers.`;
      }

      const data = {
        id: instance.profile.id,
        name: instance.profile.name,
        model: instance.profile.model,
        modelResolution: instance.modelResolution,
        purpose: instance.profile.purpose,
        whenToUse: instance.profile.whenToUse,
        status: instance.status,
        port: instance.port,
        supportsVision: instance.profile.supportsVision ?? false,
        supportsWeb: instance.profile.supportsWeb ?? false,
        startedAt: instance.startedAt.toISOString(),
        lastActivity: instance.lastActivity?.toISOString(),
        error: instance.error,
      };

      if (format === "json") return JSON.stringify(data, null, 2);
      return [
        `# ${data.name} (${data.id})`,
        "",
        `- Status: ${data.status}`,
        `- Model: ${data.model}`,
        data.modelResolution ? `- Model resolution: ${data.modelResolution}` : "",
        `- Port: ${data.port}`,
        `- Vision: ${data.supportsVision ? "yes" : "no"}`,
        `- Web: ${data.supportsWeb ? "yes" : "no"}`,
        "",
        `## Purpose`,
        data.purpose,
        "",
        `## When to use`,
        data.whenToUse,
        ...(data.error ? ["", `## Error`, String(data.error)] : []),
      ].join("\n");
    }

    const workers = workerPool.toJSON() as Array<Record<string, any>>;
    if (workers.length === 0) {
      return "No workers are currently registered. Use spawn_worker to create workers.";
    }

    const rows = workers.map((w) => [
      String(w.id),
      String(w.name),
      String(w.status),
      String(w.model),
      toBool(w.supportsVision) ? "yes" : "no",
      toBool(w.supportsWeb) ? "yes" : "no",
      String(w.port),
      String(w.purpose),
    ]);

    return format === "json"
      ? JSON.stringify(workers, null, 2)
      : renderMarkdownTable(["ID", "Name", "Status", "Model", "Vision", "Web", "Port", "Purpose"], rows);
  },
});

export const askWorker = tool({
  description: `Send a message to a specialized worker and get a response. Use this to delegate tasks to workers with specific capabilities.
  
Available workers depend on what's been spawned. Common workers:
- vision: For analyzing images and visual content
- docs: For researching documentation and examples  
- coder: For writing and editing code
- architect: For system design and planning
- explorer: For quick codebase searches`,
  args: {
    workerId: tool.schema.string().describe("ID of the worker to message (e.g., 'vision', 'docs', 'coder')"),
    message: tool.schema.string().describe("The message/question to send to the worker"),
    imageBase64: tool.schema.string().optional().describe("Optional base64-encoded image to send (for vision workers)"),
    attachments: tool.schema
      .array(
        tool.schema.object({
          type: tool.schema.enum(["image", "file"]),
          path: tool.schema.string().optional(),
          base64: tool.schema.string().optional(),
          mimeType: tool.schema.string().optional(),
        })
      )
      .optional()
      .describe("Optional attachments array (preferred when called from OpenCode with attachments)"),
    timeoutMs: tool.schema.number().optional().describe("Timeout in ms for the worker response (default: 10 minutes)"),
    from: tool.schema.string().optional().describe("Source worker ID (for worker-to-worker communication)"),
  },
  async execute(args) {
    const { workerId, message, imageBase64 } = args;

    const attachments =
      args.attachments && args.attachments.length > 0
        ? args.attachments
        : imageBase64
          ? [{ type: "image" as const, base64: imageBase64 }]
          : undefined;

    const result = await sendToWorker(workerId, message, { 
      attachments, 
      timeout: args.timeoutMs ?? 600_000,
      from: args.from,
    });

    if (!result.success) {
      return `Error communicating with worker "${workerId}": ${result.error}`;
    }

    return result.response ?? "Worker returned empty response";
  },
});

export const askWorkerAsync = tool({
  description:
    "Start a worker task asynchronously. Returns a jobId you can poll or await later with await_worker_job / get_worker_job.",
  args: {
    workerId: tool.schema.string().describe("ID of the worker to message (e.g., 'vision', 'docs', 'coder')"),
    message: tool.schema.string().describe("The message/question to send to the worker"),
    attachments: tool.schema
      .array(
        tool.schema.object({
          type: tool.schema.enum(["image", "file"]),
          path: tool.schema.string().optional(),
          base64: tool.schema.string().optional(),
          mimeType: tool.schema.string().optional(),
        })
      )
      .optional()
      .describe("Optional attachments to forward (e.g., images for vision tasks)"),
    timeoutMs: tool.schema.number().optional().describe("Timeout in ms (default: 10 minutes)"),
    from: tool.schema.string().optional().describe("Source worker ID (for worker-to-worker communication)"),
  },
  async execute(args, ctx: ToolContext) {
    const job = workerJobs.create({
      workerId: args.workerId,
      message: args.message,
      sessionId: ctx?.sessionID,
      requestedBy: ctx?.agent,
    });

    void (async () => {
      const res = await sendToWorker(args.workerId, args.message, {
        attachments: args.attachments,
        timeout: args.timeoutMs ?? 600_000,
        jobId: job.id,
        from: args.from,
      });
      if (res.success && res.response) workerJobs.setResult(job.id, { responseText: res.response });
      else workerJobs.setError(job.id, { error: res.error ?? "unknown_error" });

      const sessionId = ctx?.sessionID;
      const client = getClient();
      if (!sessionId || !client) return;
      const reason = res.success ? "result_ready" : "error";
      const summary = res.success ? "async job complete" : (res.error ?? "async job failed");
      const wakeupMessage =
        `<orchestrator-internal kind="wakeup" workerId="${args.workerId}" reason="${reason}" jobId="${job.id}">\n` +
        `[WORKER WAKEUP] Worker "${args.workerId}" ${res.success ? "completed" : "failed"} async job ${job.id}.` +
        `${summary ? ` ${summary}` : ""}\n` +
        `Check await_worker_job({ jobId: "${job.id}" }) for details.\n` +
        `</orchestrator-internal>`;
      void client.session
        .prompt({
          path: { id: sessionId },
          body: { noReply: true, parts: [{ type: "text", text: wakeupMessage }] as any },
          query: { directory: getDirectory() },
        } as any)
        .catch(() => {});
    })().catch((e) => workerJobs.setError(job.id, { error: e instanceof Error ? e.message : String(e) }));

    return JSON.stringify({ jobId: job.id, workerId: job.workerId, startedAt: job.startedAt }, null, 2);
  },
});

export const getWorkerJob = tool({
  description: "Get the status/result of a worker job started with ask_worker_async.",
  args: {
    jobId: tool.schema.string().describe("Job id from ask_worker_async"),
    format: tool.schema.enum(["markdown", "json"]).optional().describe("Output format (default: json)"),
  },
  async execute(args) {
    const job = workerJobs.get(args.jobId);
    if (!job) return `Unknown job "${args.jobId}"`;
    const format = args.format ?? "json";
    if (format === "json") return JSON.stringify(job, null, 2);
    return [
      `# Worker Job ${job.id}`,
      "",
      `- Worker: ${job.workerId}`,
      `- Status: ${job.status}`,
      `- Started: ${new Date(job.startedAt).toISOString()}`,
      ...(job.finishedAt ? [`- Finished: ${new Date(job.finishedAt).toISOString()}`, `- Duration: ${job.durationMs}ms`] : []),
      ...(job.error ? ["", "## Error", job.error] : []),
      ...(job.responseText ? ["", "## Response", job.responseText] : []),
      ...(job.report ? ["", "## Report", JSON.stringify(job.report, null, 2)] : []),
    ].join("\n");
  },
});

export const awaitWorkerJob = tool({
  description: "Wait for an async worker job to finish (succeeds or fails) and return its final record.",
  args: {
    jobId: tool.schema.string().describe("Job id from ask_worker_async"),
    timeoutMs: tool.schema.number().optional().describe("Timeout in ms (default: 10 minutes)"),
  },
  async execute(args) {
    try {
      const job = await workerJobs.await(args.jobId, { timeoutMs: args.timeoutMs ?? 600_000 });
      return JSON.stringify(job, null, 2);
    } catch (e) {
      return `Failed waiting for job "${args.jobId}": ${e instanceof Error ? e.message : String(e)}`;
    }
  },
});

export const listWorkerJobs = tool({
  description: "List recent worker jobs (async + sync results).",
  args: {
    workerId: tool.schema.string().optional().describe("Filter to a specific worker id"),
    limit: tool.schema.number().optional().describe("Max jobs to return (default: 20)"),
    format: tool.schema.enum(["markdown", "json"]).optional().describe("Output format (default: markdown)"),
  },
  async execute(args) {
    const jobs = workerJobs.list({ workerId: args.workerId, limit: args.limit ?? 20 });
    const format: "markdown" | "json" = args.format ?? getDefaultListFormat();
    if (format === "json") return JSON.stringify(jobs, null, 2);
    if (jobs.length === 0) return "No jobs recorded yet.";
    const rows = jobs.map((j) => [
      j.id,
      j.workerId,
      j.status,
      new Date(j.startedAt).toISOString(),
      j.durationMs ? `${j.durationMs}` : "",
      (j.message ?? "").slice(0, 60).replace(/\s+/g, " "),
    ]);
    return renderMarkdownTable(["Job", "Worker", "Status", "Started", "ms", "Message"], rows);
  },
});

export const getWorkerInfo = tool({
  description: "Get detailed information about a specific worker including its purpose, model, and current status",
  args: {
    workerId: tool.schema.string().describe("ID of the worker to get info about"),
    format: tool.schema.enum(["markdown", "json"]).optional().describe("Output format (default: markdown)"),
  },
  async execute(args) {
    const instance = workerPool.get(args.workerId);
    if (!instance) {
      return `Worker "${args.workerId}" not found. Use list_workers to see available workers.`;
    }

    const data = {
      id: instance.profile.id,
      name: instance.profile.name,
      model: instance.profile.model,
      purpose: instance.profile.purpose,
      whenToUse: instance.profile.whenToUse,
      status: instance.status,
      port: instance.port,
      supportsVision: instance.profile.supportsVision ?? false,
      supportsWeb: instance.profile.supportsWeb ?? false,
      startedAt: instance.startedAt.toISOString(),
      lastActivity: instance.lastActivity?.toISOString(),
      error: instance.error,
    };

    const format: "markdown" | "json" = args.format ?? getDefaultListFormat();
    if (format === "json") return JSON.stringify(data, null, 2);
    return [
      `# ${data.name} (${data.id})`,
      "",
      `- Status: ${data.status}`,
      `- Model: ${data.model}`,
      `- Port: ${data.port}`,
      `- Vision: ${data.supportsVision ? "yes" : "no"}`,
      `- Web: ${data.supportsWeb ? "yes" : "no"}`,
      "",
      `## Purpose`,
      data.purpose,
      "",
      `## When to use`,
      data.whenToUse,
      ...(data.error ? ["", `## Error`, String(data.error)] : []),
    ].join("\n");
  },
});

export const spawnNewWorker = tool({
  description: `Spawn a new worker with a specific profile. Built-in profiles: vision, docs, coder, architect, explorer.
You can also provide custom configuration to override defaults.`,
  args: {
    profileId: tool.schema.string().describe("Profile ID to use (built-in: vision, docs, coder, architect, explorer)"),
    model: tool.schema.string().optional().describe("Override the model to use"),
    customId: tool.schema.string().optional().describe("Custom ID for this worker instance"),
    showToast: tool.schema.boolean().optional().describe("Show a toast notification in the UI"),
  },
  async execute(args, ctx: ToolContext) {
    const profiles = getProfiles();
    const baseProfile = getProfile(args.profileId, profiles);
    if (!baseProfile) {
      const available = Object.keys(profiles).sort().join(", ");
      return `Unknown profile "${args.profileId}". Available profiles: ${available || "(none)"}`;
    }

    let model = baseProfile.model;
    if (args.model) {
      const normalized = await normalizeModelInput(args.model, { client: getClient(), directory: getDirectory() });
      if (!normalized.ok) return `Failed to spawn worker: ${normalized.error}`;
      model = normalized.model;
    }

    const profile = {
      ...baseProfile,
      id: args.customId ?? baseProfile.id,
      model,
    };

    try {
      const client = getClient();
      if (args.showToast && client) {
        void client.tui
          .showToast({
            body: { message: `Spawning worker "${profile.name}"…`, variant: "info" },
          })
          .catch(() => {});
      }
      const { basePort, timeout } = getSpawnDefaults();
      const existing = workerPool.get(profile.id);
      const instance = await spawnWorker(profile, {
        basePort,
        timeout,
        directory: getDirectory(),
        client,
      });
      if (ctx?.sessionID && !existing && instance.modelResolution !== "reused existing worker") {
        workerPool.trackOwnership(ctx.sessionID, instance.profile.id);
      }

      const warning = instance.warning ? `\nWarning: ${instance.warning}` : "";
      return `Worker "${profile.name}" (${profile.id}) spawned successfully on port ${instance.port}${warning}`;
    } catch (error) {
      return `Failed to spawn worker: ${error instanceof Error ? error.message : String(error)}`;
    }
  },
});

export const ensureWorkers = tool({
  description: "Ensure a set of workers are running (spawns any missing ones)",
  args: {
    profileIds: tool.schema.array(tool.schema.string()).describe("Worker profile IDs to ensure are running"),
  },
  async execute(args, ctx: ToolContext) {
    const profiles = getProfiles();
    const uniqueIds = [...new Set(args.profileIds)];
    const toSpawn: WorkerProfile[] = [];
    for (const id of uniqueIds) {
      if (workerPool.get(id)) continue;
      const profile = getProfile(id, profiles);
      if (!profile) return `Unknown profile "${id}". Run list_profiles({}) to see available profiles.`;
      toSpawn.push(profile);
    }

    if (toSpawn.length === 0) return "All requested workers are already running.";

    const { basePort, timeout } = getSpawnDefaults();
    const { succeeded, failed } = await spawnWorkers(toSpawn, {
      basePort,
      timeout,
      directory: getDirectory(),
      client: getClient(),
    });
    if (ctx?.sessionID) {
      for (const instance of succeeded) {
        if (instance.modelResolution === "reused existing worker") continue;
        workerPool.trackOwnership(ctx.sessionID, instance.profile.id);
      }
    }

    const lines: string[] = [];
    if (succeeded.length > 0) lines.push(`Spawned: ${succeeded.map((w) => w.profile.id).join(", ")}`);
    if (failed.length > 0) {
      lines.push(`Failed: ${failed.map((f) => `${f.profile.id} (${f.error})`).join(", ")}`);
    }
    return lines.join("\n");
  },
});

export const stopWorkerTool = tool({
  description: "Stop and unregister a worker",
  args: {
    workerId: tool.schema.string().describe("ID of the worker to stop"),
  },
  async execute(args) {
    const success = await stopWorker(args.workerId);
    if (success) {
      return `Worker "${args.workerId}" stopped successfully`;
    }
    return `Failed to stop worker "${args.workerId}" - not found or already stopped`;
  },
});

export const delegateTask = tool({
  description: "Auto-route a task to the best worker (optionally auto-spawn), run it, and return the response.",
  args: {
    task: tool.schema.string().describe("Task description to delegate"),
    requiresVision: tool.schema.boolean().optional().describe("If true, prefer a vision-capable worker"),
    autoSpawn: tool.schema.boolean().optional().describe("If true, spawn a suitable worker if none exist"),
    workerId: tool.schema.string().optional().describe("Force a specific worker ID"),
    attachments: tool.schema
      .array(
        tool.schema.object({
          type: tool.schema.enum(["image", "file"]),
          path: tool.schema.string().optional(),
          base64: tool.schema.string().optional(),
          mimeType: tool.schema.string().optional(),
        })
      )
      .optional()
      .describe("Optional attachments to forward (e.g., images for vision tasks)"),
  },
  async execute(args, ctx: ToolContext) {
    const profiles = getProfiles();
    const requiresVision = args.requiresVision ?? false;
    const autoSpawn = args.autoSpawn ?? true;

    let targetId = args.workerId;
    if (!targetId) {
      if (requiresVision) {
        const vision = workerPool.getVisionWorkers();
        targetId = vision[0]?.profile.id;
      } else {
        const matches = workerPool.getWorkersByCapability(args.task);
        const active = workerPool.getActiveWorkers();
        targetId = matches[0]?.profile.id ?? active[0]?.profile.id;
      }
    }

    if (!targetId && autoSpawn) {
      const guessProfile =
        requiresVision
          ? "vision"
          : /\b(doc|docs|documentation|reference|api|example|research|cite)\b/i.test(args.task)
            ? "docs"
            : /\b(architecture|design|plan|approach|tradeoff)\b/i.test(args.task)
              ? "architect"
              : "coder";

      const profile = getProfile(guessProfile, profiles);
      if (!profile) return `No suitable profile found to spawn (wanted "${guessProfile}").`;
      const { basePort, timeout } = getSpawnDefaults();
      const instance = await spawnWorker(profile, {
        basePort,
        timeout,
        directory: getDirectory(),
        client: getClient(),
      });
      targetId = instance.profile.id;
      if (ctx?.sessionID && instance.modelResolution !== "reused existing worker") {
        workerPool.trackOwnership(ctx.sessionID, instance.profile.id);
      }
    }

    if (!targetId) {
      return "No workers available. Spawn one with spawn_worker({ profileId: 'coder' }) or run ensure_workers({ profileIds: [...] }).";
    }

    const result = await sendToWorker(targetId, args.task, { attachments: args.attachments });
    if (!result.success) return `Delegation failed (${targetId}): ${result.error}`;

    return [`# Delegated to ${targetId}`, "", result.response ?? ""].join("\n");
  },
});

export const findWorker = tool({
  description: "Find the most suitable worker for a given task based on capabilities",
  args: {
    task: tool.schema.string().describe("Description of the task you need help with"),
    requiresVision: tool.schema.boolean().optional().describe("Whether the task requires image analysis"),
  },
  async execute(args) {
    const { task, requiresVision } = args;

    if (requiresVision) {
      const visionWorkers = workerPool.getVisionWorkers();
      if (visionWorkers.length === 0) {
        return "No vision-capable workers available. Spawn a vision worker first.";
      }
      const worker = visionWorkers[0];
      return JSON.stringify({
        recommendation: worker.profile.id,
        name: worker.profile.name,
        reason: "This worker supports vision and can analyze images",
        status: worker.status,
      });
    }

    const matches = workerPool.getWorkersByCapability(task);
    if (matches.length === 0) {
      const all = workerPool.getActiveWorkers();
      if (all.length === 0) {
        return "No workers available. Spawn workers first.";
      }
      return JSON.stringify({
        recommendation: all[0].profile.id,
        name: all[0].profile.name,
        reason: "No specific match found, using first available worker",
        allAvailable: all.map((w) => ({ id: w.profile.id, purpose: w.profile.purpose })),
      });
    }

    const best = matches[0];
    return JSON.stringify({
      recommendation: best.profile.id,
      name: best.profile.name,
      reason: best.profile.whenToUse,
      status: best.status,
      alternatives: matches.slice(1).map((w) => ({ id: w.profile.id, purpose: w.profile.purpose })),
    });
  },
});

export const workerTrace = tool({
  description:
    "Show recent activity from a worker by reading its session messages (includes tool calls and step boundaries).",
  args: {
    workerId: tool.schema.string().describe("Worker ID (e.g. 'docs', 'vision')"),
    limit: tool.schema.number().optional().describe("Max messages to pull (default: 50)"),
    format: tool.schema.enum(["markdown", "json"]).optional().describe("Output format (default: markdown)"),
  },
  async execute(args) {
    const instance = workerPool.get(args.workerId);
    if (!instance) return `Worker "${args.workerId}" not found.`;
    if (!instance.client || !instance.sessionId) return `Worker "${args.workerId}" not initialized.`;

    const limit = args.limit ?? 50;
    const res = await instance.client.session.messages({
      path: { id: instance.sessionId },
      query: { directory: instance.directory ?? process.cwd(), limit },
    });

    const data = res.data as any[];
    const format: "markdown" | "json" = args.format ?? getDefaultListFormat();
    if (format === "json") return JSON.stringify(data, null, 2);

    const lines: string[] = [];
    lines.push(`# Worker Trace: ${instance.profile.name} (${instance.profile.id})`);
    lines.push("");
    lines.push(`- Model: ${instance.profile.model}`);
    lines.push(`- Status: ${instance.status}`);
    lines.push(`- Port: ${instance.port}`);
    lines.push("");

    for (const msg of data ?? []) {
      const info = msg?.info;
      const parts = msg?.parts ?? [];
      const role = info?.role ?? "unknown";
      lines.push(`## ${role} ${info?.id ?? ""}`.trim());
      for (const part of parts) {
        const t = part?.type;
        if (t === "text") lines.push(part.text);
        else if (t === "tool") lines.push(`- [tool:${part.tool}] ${part.state?.title ?? ""}`.trim());
        else if (t === "step-start") lines.push("- [step] start");
        else if (t === "step-finish") lines.push(`- [step] finish (${part.reason ?? "stop"})`);
        else if (t === "reasoning") lines.push("(reasoning omitted)");
      }
      lines.push("");
    }

    return lines.join("\n");
  },
});
