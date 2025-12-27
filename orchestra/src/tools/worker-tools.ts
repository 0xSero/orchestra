import { tool } from "@opencode-ai/plugin";
import type { OrchestratorService } from "../orchestrator";
import type { WorkerManager } from "../workers";
import type { WorkerAttachment } from "../workers/prompt";

export type WorkerToolsDeps = {
  orchestrator: OrchestratorService;
  workers: WorkerManager;
};

type ToolDefinition = ReturnType<typeof tool>;

function attachmentSchema() {
  return tool.schema.object({
    type: tool.schema.enum(["image", "file"]),
    path: tool.schema.string().optional(),
    base64: tool.schema.string().optional(),
    mimeType: tool.schema.string().optional(),
  });
}

function serialize(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

export function createWorkerTools(deps: WorkerToolsDeps): Record<string, ToolDefinition> {
  const spawnWorker = tool({
    description: "Spawn a worker by profile ID",
    args: {
      profileId: tool.schema.string().describe("Worker profile ID"),
    },
    async execute(args) {
      const worker = await deps.orchestrator.ensureWorker({ workerId: args.profileId, reason: "manual" });
      return serialize({
        id: worker.profile.id,
        status: worker.status,
        port: worker.port,
        model: worker.profile.model,
      });
    },
  });

  const stopWorker = tool({
    description: "Stop a running worker",
    args: {
      workerId: tool.schema.string().describe("Worker ID"),
    },
    async execute(args) {
      const ok = await deps.workers.stopWorker(args.workerId);
      return ok ? `Stopped ${args.workerId}.` : `Worker "${args.workerId}" not found.`;
    },
  });

  const listWorkers = tool({
    description: "List running workers",
    args: {},
    async execute() {
      return serialize(
        deps.workers.listWorkers().map((w) => ({
          id: w.profile.id,
          name: w.profile.name,
          model: w.profile.model,
          status: w.status,
          port: w.port,
          serverUrl: w.serverUrl,
        })),
      );
    },
  });

  const listProfiles = tool({
    description: "List available worker profiles",
    args: {},
    async execute() {
      return serialize(
        deps.workers.listProfiles().map((p) => ({
          id: p.id,
          name: p.name,
          model: p.model,
          purpose: p.purpose,
          whenToUse: p.whenToUse,
          supportsVision: Boolean(p.supportsVision),
          supportsWeb: Boolean(p.supportsWeb),
        })),
      );
    },
  });

  const askWorker = tool({
    description: "Send a message to a worker and wait for the response",
    args: {
      workerId: tool.schema.string().describe("Worker ID"),
      message: tool.schema.string().describe("Message to send"),
      attachments: tool.schema.array(attachmentSchema()).optional(),
      autoSpawn: tool.schema.boolean().optional().describe("Auto-spawn missing workers (default: true)"),
    },
    async execute(args) {
      if (args.autoSpawn !== false) {
        await deps.orchestrator.ensureWorker({ workerId: args.workerId, reason: "on-demand" });
      }
      const res = await deps.workers.send(args.workerId, args.message, {
        attachments: args.attachments as WorkerAttachment[] | undefined,
      });
      if (!res.success) return res.error ?? "Worker request failed";
      return res.response ?? "";
    },
  });

  const askWorkerAsync = tool({
    description: "Send a message to a worker asynchronously and return a job ID",
    args: {
      workerId: tool.schema.string().describe("Worker ID"),
      message: tool.schema.string().describe("Message to send"),
      attachments: tool.schema.array(attachmentSchema()).optional(),
      autoSpawn: tool.schema.boolean().optional().describe("Auto-spawn missing workers (default: true)"),
    },
    async execute(args, ctx) {
      if (args.autoSpawn !== false) {
        await deps.orchestrator.ensureWorker({ workerId: args.workerId, reason: "on-demand" });
      }
      const job = deps.workers.jobs.create({
        workerId: args.workerId,
        message: args.message,
        sessionId: ctx?.sessionID,
        requestedBy: ctx?.agent,
      });

      void (async () => {
        const res = await deps.workers.send(args.workerId, args.message, {
          attachments: args.attachments as WorkerAttachment[] | undefined,
          jobId: job.id,
          from: ctx?.agent,
        });
        if (!res.success) {
          deps.workers.jobs.setResult(job.id, { error: res.error ?? "worker failed" });
          return;
        }
        deps.workers.jobs.setResult(job.id, { responseText: res.response ?? "" });
      })();

      return serialize({ jobId: job.id, workerId: args.workerId });
    },
  });

  const awaitWorkerJob = tool({
    description: "Wait for an async job result",
    args: {
      jobId: tool.schema.string().describe("Job ID"),
      timeoutMs: tool.schema.number().optional().describe("Timeout in ms"),
    },
    async execute(args) {
      const job = await deps.workers.jobs.await(args.jobId, { timeoutMs: args.timeoutMs });
      return serialize(job);
    },
  });

  const delegateTask = tool({
    description: "Route a task to the best worker and return the response",
    args: {
      task: tool.schema.string().describe("Task to delegate"),
      attachments: tool.schema.array(attachmentSchema()).optional(),
      autoSpawn: tool.schema.boolean().optional().describe("Auto-spawn missing workers (default: true)"),
    },
    async execute(args) {
      const res = await deps.orchestrator.delegateTask({
        task: args.task,
        attachments: args.attachments as WorkerAttachment[] | undefined,
        autoSpawn: args.autoSpawn,
      });
      return res.response;
    },
  });

  return {
    spawn_worker: spawnWorker,
    stop_worker: stopWorker,
    list_workers: listWorkers,
    list_profiles: listProfiles,
    ask_worker: askWorker,
    ask_worker_async: askWorkerAsync,
    await_worker_job: awaitWorkerJob,
    delegate_task: delegateTask,
  } as const;
}
