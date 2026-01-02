import { tool, type ToolDefinition } from "@opencode-ai/plugin";
import { getProfile } from "../config/profiles";
import { workerJobs } from "../core/jobs";
import type { OrchestratorContext } from "../context/orchestrator-context";
import { sendToWorker, spawnWorker, stopWorker } from "../workers/spawner";
import { renderMarkdownTable } from "./markdown";
import type { ToolContext } from "./state";
import { getOrchestratorContext } from "./state";
import { getWorkflow, listWorkflows } from "../workflows/engine";
import type { WorkflowRunResult } from "../workflows/types";
import {
  continueWorkflowWithContext,
  resolveWorkflowLimits,
  runWorkflowWithContext,
} from "../workflows/runner";
import { getLogBuffer } from "../core/logger";
import {
  fetchOpencodeConfig,
  fetchProviders,
  filterProviders,
  flattenProviders,
} from "../models/catalog";
import { resolveWorkerModel } from "../models/resolve";
import { loadNeo4jConfigFromEnv } from "../memory/neo4j";
import { linkMemory, upsertMemory, type MemoryScope } from "../memory/graph";
import {
  completeMemoryTask,
  recordMemoryLink,
  recordMemoryPut,
} from "../memory/tasks";
import { publishOrchestratorEvent } from "../core/orchestrator-events";

type TaskTools = {
  taskStart: ToolDefinition;
  taskAwait: ToolDefinition;
  taskPeek: ToolDefinition;
  taskList: ToolDefinition;
  taskCancel: ToolDefinition;
};

type ToolAttachment = {
  type: "image" | "file";
  path?: string;
  base64?: string;
  mimeType?: string;
};

type MemoryOpKind = "memory.put" | "memory.link" | "memory.done";
type WorkerModelOpKind = "worker.model.set" | "worker.model.reset";
type TaskOpKind = MemoryOpKind | WorkerModelOpKind;

type MemoryOpPayload = {
  taskId?: string;
  scope?: "project" | "global";
  key?: string;
  value?: string;
  tags?: string[];
  fromKey?: string;
  toKey?: string;
  relation?: string;
  summary?: string;
  storedKeys?: string[];
  linkedKeys?: Array<{ from: string; to: string; relation: string }>;
  notes?: string;
};

type WorkerModelOpPayload = {
  workerId?: string;
  model?: string;
  modelPolicy?: "dynamic" | "sticky";
  respawn?: boolean;
};

function hasImageAttachment(
  attachments: ToolAttachment[] | undefined,
): boolean {
  return Boolean(attachments?.some((a) => a.type === "image"));
}

function guessWorkerId(task: string, attachments?: ToolAttachment[]): string {
  if (hasImageAttachment(attachments)) return "vision";
  if (
    /\b(doc|docs|documentation|reference|api|example|examples|research|cite)\b/i.test(
      task,
    )
  )
    return "docs";
  if (
    /\b(architecture|architect|design|plan|approach|trade[- ]?off)\b/i.test(
      task,
    )
  )
    return "architect";
  if (/\b(search|find|locate|grep|ripgrep|scan|explore|where)\b/i.test(task))
    return "explorer";
  return "coder";
}

function pickWorkflowResponse(result: WorkflowRunResult): {
  success: boolean;
  response?: string;
  error?: string;
} {
  const errorStep = result.steps.find((step) => step.status === "error");
  if (errorStep) {
    return { success: false, error: errorStep.error ?? "workflow step failed" };
  }
  if (result.status === "error") {
    return { success: false, error: "workflow failed" };
  }
  const responseStep = [...result.steps]
    .reverse()
    .find(
      (step) => typeof step.response === "string" && step.response.length > 0,
    );
  if (!responseStep) {
    return { success: false, error: "workflow produced no response" };
  }
  return { success: true, response: responseStep.response };
}

function resolveMemoryScope(
  context: OrchestratorContext,
  input?: string,
): MemoryScope {
  if (input === "project" || input === "global") return input;
  return (context.config.memory?.scope ?? "project") as MemoryScope;
}

async function runMemoryOp(
  context: OrchestratorContext,
  op: MemoryOpKind,
  memory?: MemoryOpPayload,
): Promise<{ ok: boolean; response?: string; error?: string }> {
  if (op === "memory.put") {
    const cfg = loadNeo4jConfigFromEnv();
    if (!cfg) {
      return {
        ok: false,
        error:
          "Neo4j is not configured. Set env vars: OPENCODE_NEO4J_URI, OPENCODE_NEO4J_USERNAME, OPENCODE_NEO4J_PASSWORD (and optional OPENCODE_NEO4J_DATABASE).",
      };
    }
    const key = memory?.key?.trim();
    const value = memory?.value?.trim();
    if (!key || !value)
      return {
        ok: false,
        error: "Missing memory.key/memory.value for op memory.put.",
      };

    const scope = resolveMemoryScope(context, memory?.scope);
    const projectId = scope === "project" ? context.projectId : undefined;
    if (scope === "project" && !projectId)
      return { ok: false, error: "Missing projectId; restart OpenCode." };

    const node = await upsertMemory({
      cfg,
      scope,
      projectId,
      key,
      value,
      tags: memory?.tags ?? [],
    });

    if (memory?.taskId) recordMemoryPut(memory.taskId, node.key);
    publishOrchestratorEvent("orchestra.memory.written", {
      action: "put",
      scope,
      projectId,
      taskId: memory?.taskId,
      key: node.key,
      tags: memory?.tags ?? [],
    });

    return { ok: true, response: JSON.stringify(node, null, 2) };
  }

  if (op === "memory.link") {
    const cfg = loadNeo4jConfigFromEnv();
    if (!cfg) {
      return {
        ok: false,
        error:
          "Neo4j is not configured. Set env vars: OPENCODE_NEO4J_URI, OPENCODE_NEO4J_USERNAME, OPENCODE_NEO4J_PASSWORD (and optional OPENCODE_NEO4J_DATABASE).",
      };
    }
    const fromKey = memory?.fromKey?.trim();
    const toKey = memory?.toKey?.trim();
    if (!fromKey || !toKey)
      return {
        ok: false,
        error: "Missing memory.fromKey/memory.toKey for op memory.link.",
      };

    const scope = resolveMemoryScope(context, memory?.scope);
    const projectId = scope === "project" ? context.projectId : undefined;
    if (scope === "project" && !projectId)
      return { ok: false, error: "Missing projectId; restart OpenCode." };

    const relation = memory?.relation ?? "relates_to";
    const res = await linkMemory({
      cfg,
      scope,
      projectId,
      fromKey,
      toKey,
      type: relation,
    });

    if (memory?.taskId)
      recordMemoryLink(memory.taskId, fromKey, toKey, relation);
    publishOrchestratorEvent("orchestra.memory.written", {
      action: "link",
      scope,
      projectId,
      taskId: memory?.taskId,
      fromKey,
      toKey,
      relation,
    });

    return { ok: true, response: JSON.stringify(res, null, 2) };
  }

  const taskId = memory?.taskId?.trim();
  if (!taskId)
    return { ok: false, error: "Missing memory.taskId for op memory.done." };

  const result = completeMemoryTask(taskId, {
    summary: memory?.summary,
    storedKeys: memory?.storedKeys,
    linkedKeys: memory?.linkedKeys,
    notes: memory?.notes,
  });

  return result.ok
    ? { ok: true, response: result.message }
    : { ok: false, error: result.message };
}

function isMemoryOp(op: TaskOpKind): op is MemoryOpKind {
  return op.startsWith("memory.");
}

async function runWorkerModelOp(
  context: OrchestratorContext,
  op: WorkerModelOpKind,
  worker?: WorkerModelOpPayload,
  sessionId?: string,
): Promise<{ ok: boolean; response?: string; error?: string }> {
  const workerId = worker?.workerId?.trim();
  if (!workerId)
    return { ok: false, error: `Missing worker.workerId for op ${op}.` };

  const instance = context.workerPool.get(workerId);
  if (!instance)
    return {
      ok: false,
      error: `Worker "${workerId}" is not running. Spawn it first.`,
    };

  const baseProfile = getProfile(workerId, context.profiles);
  if (!baseProfile)
    return { ok: false, error: `Unknown worker "${workerId}".` };

  const client = context.client;
  if (!client)
    return {
      ok: false,
      error: "OpenCode client not available; restart OpenCode.",
    };

  const [cfg, providersRes] = await Promise.all([
    fetchOpencodeConfig(client, context.directory),
    fetchProviders(client, context.directory),
  ]);

  let resolved: ReturnType<typeof resolveWorkerModel>;
  if (op === "worker.model.set") {
    const modelRef = worker?.model?.trim();
    if (!modelRef)
      return {
        ok: false,
        error: "Missing worker.model for op worker.model.set.",
      };
    resolved = resolveWorkerModel({
      profile: instance.profile,
      overrideModelRef: modelRef,
      config: cfg,
      providers: providersRes.providers,
      providerDefaults: providersRes.defaults,
    });
  } else {
    resolved = resolveWorkerModel({
      profile: baseProfile,
      config: cfg,
      providers: providersRes.providers,
      providerDefaults: providersRes.defaults,
    });
  }

  const modelPolicy =
    worker?.modelPolicy ?? (op === "worker.model.set" ? "sticky" : "dynamic");
  const respawn = worker?.respawn === true;
  const nextProfile = { ...instance.profile, model: resolved.resolvedModel };

  if (respawn) {
    const stopped = await stopWorker(workerId);
    if (!stopped)
      return {
        ok: false,
        error: `Failed to stop worker "${workerId}" for respawn.`,
      };

    const { basePort, timeout } = context.spawnDefaults;
    const spawned = await spawnWorker(nextProfile, {
      basePort,
      timeout,
      directory: instance.directory ?? context.directory,
      client,
      parentSessionId: instance.parentSessionId ?? sessionId,
    });
    spawned.profile = { ...spawned.profile, model: resolved.resolvedModel };
    spawned.modelRef = resolved.modelRef;
    spawned.modelPolicy = modelPolicy;
    spawned.modelResolution = resolved.reason;
    return {
      ok: true,
      response: JSON.stringify(
        {
          workerId: spawned.profile.id,
          modelRef: resolved.modelRef,
          model: resolved.resolvedModel,
          modelPolicy,
          modelResolution: resolved.reason,
          respawned: true,
        },
        null,
        2,
      ),
    };
  }

  instance.profile = nextProfile;
  instance.modelRef = resolved.modelRef;
  instance.modelPolicy = modelPolicy;
  instance.modelResolution = resolved.reason;
  return {
    ok: true,
    response: JSON.stringify(
      {
        workerId: instance.profile.id,
        modelRef: resolved.modelRef,
        model: resolved.resolvedModel,
        modelPolicy,
        modelResolution: resolved.reason,
        respawned: false,
      },
      null,
      2,
    ),
  };
}

async function ensureWorkerForTask(
  context: OrchestratorContext,
  input: { workerId: string; autoSpawn: boolean; sessionId?: string },
): Promise<{ ok: boolean; error?: string }> {
  const workerPool = context.workerPool;
  const existing = workerPool.get(input.workerId);
  if (existing && existing.status !== "stopped") return { ok: true };
  if (!input.autoSpawn) {
    return {
      ok: false,
      error: `Worker "${input.workerId}" is not running. Set autoSpawn=true or spawn it first.`,
    };
  }

  const profile = getProfile(input.workerId, context.profiles);
  if (!profile) {
    const available = Object.keys(context.profiles).sort().join(", ");
    return {
      ok: false,
      error: `Unknown worker "${input.workerId}". Available profiles: ${available || "(none)"}`,
    };
  }

  const { basePort, timeout } = context.spawnDefaults;
  const instance = await spawnWorker(profile, {
    basePort,
    timeout,
    directory: context.directory,
    client: context.client,
    parentSessionId: input.sessionId,
  });

  if (
    input.sessionId &&
    instance.modelResolution !== "reused existing worker"
  ) {
    workerPool.trackOwnership(input.sessionId, instance.profile.id);
  }

  return { ok: true };
}

export function createTaskTools(context: OrchestratorContext): TaskTools {
  const taskStart: ToolDefinition = tool({
    description:
      "Start a background task (worker, workflow, or op). Always returns a taskId; use task_await to get the result.",
    args: {
      kind: tool.schema
        .enum(["auto", "worker", "workflow", "op"])
        .optional()
        .describe(
          "Task kind (default: auto = pick a worker based on task/attachments)",
        ),
      task: tool.schema
        .string()
        .describe(
          "What to do (sent to worker/workflow; for op use a short label)",
        ),
      workerId: tool.schema
        .string()
        .optional()
        .describe("Worker id when kind=worker (e.g. 'docs', 'coder')"),
      model: tool.schema
        .string()
        .optional()
        .describe(
          "Model override for kind=worker (tag like node:fast or provider/model)",
        ),
      modelPolicy: tool.schema
        .enum(["dynamic", "sticky"])
        .optional()
        .describe(
          "Model override policy (dynamic = per-task, sticky = update worker default)",
        ),
      workflowId: tool.schema
        .string()
        .optional()
        .describe("Workflow id when kind=workflow (e.g. 'roocode-boomerang')"),
      continueRunId: tool.schema
        .string()
        .optional()
        .describe(
          "Continue a paused workflow run by runId (kind=workflow only)",
        ),
      op: tool.schema
        .enum([
          "memory.put",
          "memory.link",
          "memory.done",
          "worker.model.set",
          "worker.model.reset",
        ])
        .optional()
        .describe(
          "Operation id when kind=op (memory.put/memory.link/memory.done/worker.model.set/worker.model.reset)",
        ),
      memory: tool.schema
        .object({
          taskId: tool.schema.string().optional(),
          scope: tool.schema.enum(["project", "global"]).optional(),
          key: tool.schema.string().optional(),
          value: tool.schema.string().optional(),
          tags: tool.schema.array(tool.schema.string()).optional(),
          fromKey: tool.schema.string().optional(),
          toKey: tool.schema.string().optional(),
          relation: tool.schema.string().optional(),
          summary: tool.schema.string().optional(),
          storedKeys: tool.schema.array(tool.schema.string()).optional(),
          linkedKeys: tool.schema
            .array(
              tool.schema.object({
                from: tool.schema.string(),
                to: tool.schema.string(),
                relation: tool.schema.string(),
              }),
            )
            .optional(),
          notes: tool.schema.string().optional(),
        })
        .optional()
        .describe("Memory op payload when kind=op"),
      worker: tool.schema
        .object({
          workerId: tool.schema.string().optional(),
          model: tool.schema.string().optional(),
          modelPolicy: tool.schema.enum(["dynamic", "sticky"]).optional(),
          respawn: tool.schema.boolean().optional(),
        })
        .optional()
        .describe("Worker model op payload when kind=op"),
      attachments: tool.schema
        .array(
          tool.schema.object({
            type: tool.schema.enum(["image", "file"]),
            path: tool.schema.string().optional(),
            base64: tool.schema.string().optional(),
            mimeType: tool.schema.string().optional(),
          }),
        )
        .optional()
        .describe(
          "Optional attachments (images/files) to forward to the worker/workflow",
        ),
      autoSpawn: tool.schema
        .boolean()
        .optional()
        .describe("Auto-spawn missing workers (default: true)"),
      timeoutMs: tool.schema
        .number()
        .optional()
        .describe("Timeout for the underlying work (default: 10 minutes)"),
      from: tool.schema
        .string()
        .optional()
        .describe("Source worker id (for worker-to-worker communication)"),
    },
    async execute(args, ctx: ToolContext) {
      const kind = args.kind ?? "auto";
      const autoSpawn = args.autoSpawn ?? true;
      const timeoutMs = args.timeoutMs ?? 600_000;
      const modelPolicy = args.modelPolicy ?? "dynamic";
      const sessionId = ctx?.sessionID;

      const resolvedKind = kind === "auto" ? "worker" : kind;
      const resolvedWorkerId =
        resolvedKind === "worker"
          ? (args.workerId ?? guessWorkerId(args.task, args.attachments))
          : undefined;
      const resolvedWorkflowId =
        resolvedKind === "workflow" ? args.workflowId : undefined;

      const jobWorkerId =
        resolvedKind === "workflow"
          ? `workflow:${resolvedWorkflowId ?? (args.continueRunId ? "continue" : "unknown")}`
          : resolvedKind === "op"
            ? `op:${args.op ?? "unknown"}`
            : (resolvedWorkerId ?? "worker:unknown");

      const job = workerJobs.create({
        workerId: jobWorkerId,
        message: args.task,
        sessionId,
        requestedBy: ctx?.agent,
      });

      const run = async () => {
        try {
          if (resolvedKind === "workflow") {
            if (context.workflows?.enabled === false) {
              workerJobs.setError(job.id, {
                error:
                  "Workflows are disabled. Enable workflows.enabled in orchestrator.json.",
              });
              return;
            }

            if (args.continueRunId) {
              const result = await continueWorkflowWithContext(
                context,
                args.continueRunId,
                { sessionId },
              );

              const picked = pickWorkflowResponse(result);
              if (picked.success && picked.response) {
                workerJobs.setResult(job.id, { responseText: picked.response });
              } else {
                workerJobs.setError(job.id, {
                  error: picked.error ?? "workflow failed",
                });
              }

              workerJobs.attachReport(job.id, {
                summary: `${result.workflowName} (${result.workflowId})`,
                details: JSON.stringify(
                  {
                    runId: result.runId,
                    status: result.status,
                    steps: result.steps.map((s) => ({
                      id: s.id,
                      title: s.title,
                      workerId: s.workerId,
                      status: s.status,
                      durationMs: s.durationMs,
                      warning: s.warning,
                      error: s.error,
                    })),
                  },
                  null,
                  2,
                ),
              });
              return;
            }

            const workflowId = resolvedWorkflowId;
            if (!workflowId) {
              workerJobs.setError(job.id, {
                error:
                  "Missing workflowId for kind=workflow (or set continueRunId).",
              });
              return;
            }

            const workflow = getWorkflow(workflowId);
            if (!workflow) {
              workerJobs.setError(job.id, {
                error: `Unknown workflow "${workflowId}".`,
              });
              return;
            }

            const limits = resolveWorkflowLimits(context, workflowId);
            const result = await runWorkflowWithContext(
              context,
              {
                workflowId,
                task: args.task,
                attachments: args.attachments,
                autoSpawn,
                limits,
              },
              { sessionId },
            );

            const picked = pickWorkflowResponse(result);
            if (picked.success && picked.response) {
              workerJobs.setResult(job.id, { responseText: picked.response });
            } else {
              workerJobs.setError(job.id, {
                error: picked.error ?? "workflow failed",
              });
            }

            workerJobs.attachReport(job.id, {
              summary: `${result.workflowName} (${result.workflowId})`,
              details: JSON.stringify(
                {
                  runId: result.runId,
                  status: result.status,
                  steps: result.steps.map((s) => ({
                    id: s.id,
                    title: s.title,
                    workerId: s.workerId,
                    status: s.status,
                    durationMs: s.durationMs,
                    warning: s.warning,
                    error: s.error,
                  })),
                },
                null,
                2,
              ),
            });
            return;
          }

          if (resolvedKind === "op") {
            const op = args.op as TaskOpKind | undefined;
            if (!op) {
              workerJobs.setError(job.id, { error: "Missing op for kind=op." });
              return;
            }

            const result = isMemoryOp(op)
              ? await runMemoryOp(context, op, args.memory)
              : await runWorkerModelOp(context, op, args.worker, sessionId);
            if (result.ok && result.response)
              workerJobs.setResult(job.id, { responseText: result.response });
            else
              workerJobs.setError(job.id, {
                error: result.error ?? "op failed",
              });
            return;
          }

          const workerId = resolvedWorkerId;
          if (!workerId) {
            workerJobs.setError(job.id, { error: "Missing workerId." });
            return;
          }

          const ensured = await ensureWorkerForTask(context, {
            workerId,
            autoSpawn,
            sessionId,
          });
          if (!ensured.ok) {
            workerJobs.setError(job.id, {
              error: ensured.error ?? "failed to ensure worker",
            });
            return;
          }

          let resolvedModelOverride: string | undefined;
          if (args.model) {
            const client = context.client;
            if (!client) {
              workerJobs.setError(job.id, {
                error: "OpenCode client not available; restart OpenCode.",
              });
              return;
            }

            const instance = context.workerPool.get(workerId);
            const profile =
              instance?.profile ?? getProfile(workerId, context.profiles);
            if (!profile) {
              workerJobs.setError(job.id, {
                error: `Unknown worker "${workerId}".`,
              });
              return;
            }

            const [cfg, providersRes] = await Promise.all([
              fetchOpencodeConfig(client, context.directory),
              fetchProviders(client, context.directory),
            ]);

            const resolved = resolveWorkerModel({
              profile,
              overrideModelRef: args.model,
              config: cfg,
              providers: providersRes.providers,
              providerDefaults: providersRes.defaults,
            });

            resolvedModelOverride = resolved.resolvedModel;

            if (instance && modelPolicy === "sticky") {
              instance.profile = {
                ...instance.profile,
                model: resolved.resolvedModel,
              };
              instance.modelRef = resolved.modelRef;
              instance.modelPolicy = "sticky";
              instance.modelResolution = resolved.reason;
            }
          }

          const res = await sendToWorker(workerId, args.task, {
            attachments: args.attachments,
            timeout: timeoutMs,
            jobId: job.id,
            from: args.from,
            sessionId,
            model: resolvedModelOverride,
          });

          if (res.success && res.response)
            workerJobs.setResult(job.id, { responseText: res.response });
          else
            workerJobs.setError(job.id, {
              error: res.error ?? "unknown_error",
            });
        } catch (err) {
          workerJobs.setError(job.id, {
            error: err instanceof Error ? err.message : String(err),
          });
        }
      };

      void run();

      return JSON.stringify(
        {
          taskId: job.id,
          kind: resolvedKind,
          ...(resolvedKind === "workflow"
            ? {
                workflowId: resolvedWorkflowId,
                continueRunId: args.continueRunId,
              }
            : resolvedKind === "op"
              ? { op: args.op }
              : { workerId: resolvedWorkerId }),
          status: "running",
          next: "task_await",
        },
        null,
        2,
      );
    },
  });

  const taskAwait: ToolDefinition = tool({
    description:
      "Wait for one (or many) task(s) to finish and return the final job record(s).",
    args: {
      taskId: tool.schema
        .string()
        .optional()
        .describe("Task id from task_start"),
      taskIds: tool.schema
        .array(tool.schema.string())
        .optional()
        .describe("Multiple task ids to await"),
      timeoutMs: tool.schema
        .number()
        .optional()
        .describe("Timeout in ms (default: 10 minutes)"),
    },
    async execute(args) {
      const timeoutMs = args.timeoutMs ?? 600_000;
      const ids = args.taskId ? [args.taskId] : (args.taskIds ?? []);
      if (ids.length === 0) return "Missing taskId/taskIds.";

      const results = await Promise.all(
        ids.map(async (id) => {
          try {
            return await workerJobs.await(id, { timeoutMs });
          } catch (err) {
            return {
              id,
              status: "failed",
              error: err instanceof Error ? err.message : String(err),
            };
          }
        }),
      );

      return JSON.stringify(ids.length === 1 ? results[0] : results, null, 2);
    },
  });

  const taskPeek: ToolDefinition = tool({
    description:
      "Get the current status/result of one (or many) task(s) without waiting.",
    args: {
      taskId: tool.schema.string().optional().describe("Task id"),
      taskIds: tool.schema
        .array(tool.schema.string())
        .optional()
        .describe("Multiple task ids"),
    },
    async execute(args) {
      const ids = args.taskId ? [args.taskId] : (args.taskIds ?? []);
      if (ids.length === 0) return "Missing taskId/taskIds.";
      const results = ids.map(
        (id) => workerJobs.get(id) ?? { id, status: "unknown" },
      );
      return JSON.stringify(ids.length === 1 ? results[0] : results, null, 2);
    },
  });

  const taskList: ToolDefinition = tool({
    description:
      "List tasks (default) or other orchestrator resources via view=workers|profiles|models|workflows|status|output.",
    args: {
      view: tool.schema
        .enum([
          "tasks",
          "workers",
          "profiles",
          "models",
          "workflows",
          "status",
          "output",
        ])
        .optional()
        .describe("What to list (default: tasks)"),
      workerId: tool.schema.string().optional().describe("Filter by worker id"),
      limit: tool.schema
        .number()
        .optional()
        .describe("Max tasks to return (default: 20)"),
      after: tool.schema
        .number()
        .optional()
        .describe(
          "Only include events after this unix-ms timestamp (output view)",
        ),
      scope: tool.schema
        .enum(["configured", "all"])
        .optional()
        .describe(
          "models view: which providers to include (default: configured)",
        ),
      providers: tool.schema
        .array(tool.schema.string())
        .optional()
        .describe("models view: explicit provider allowlist (overrides scope)"),
      query: tool.schema
        .string()
        .optional()
        .describe("models view: filter by substring"),
      format: tool.schema
        .enum(["markdown", "json"])
        .optional()
        .describe("Output format (default: markdown)"),
    },
    async execute(args) {
      const format: "markdown" | "json" =
        args.format ?? context.defaultListFormat;
      const view = args.view ?? "tasks";

      if (view === "workers") {
        const workers = context.workerPool.toJSON();
        if (format === "json") return JSON.stringify(workers, null, 2);
        if (workers.length === 0) return "No workers are currently registered.";
        const rows = workers.map((w: any) => [
          String(w.id),
          String(w.status),
          String(w.modelRef ?? ""),
          String(w.model),
          String(w.modelPolicy ?? ""),
          String(w.modelResolution ?? ""),
          w.supportsVision ? "yes" : "no",
          w.supportsWeb ? "yes" : "no",
          String(w.port ?? ""),
          String(w.purpose ?? ""),
        ]);
        return renderMarkdownTable(
          [
            "Worker",
            "Status",
            "Model Ref",
            "Model",
            "Policy",
            "Reason",
            "Vision",
            "Web",
            "Port",
            "Purpose",
          ],
          rows,
        );
      }

      if (view === "profiles") {
        const profiles = Object.values(context.profiles)
          .sort((a, b) => a.id.localeCompare(b.id))
          .map((p) => ({
            id: p.id,
            name: p.name,
            model: p.model,
            supportsVision: p.supportsVision ?? false,
            supportsWeb: p.supportsWeb ?? false,
            purpose: p.purpose,
          }));
        if (format === "json") return JSON.stringify(profiles, null, 2);
        if (profiles.length === 0) return "No profiles available.";
        const rows = profiles.map((p) => [
          p.id,
          p.name,
          p.model,
          p.supportsVision ? "yes" : "no",
          p.supportsWeb ? "yes" : "no",
          p.purpose,
        ]);
        return renderMarkdownTable(
          ["ID", "Name", "Model", "Vision", "Web", "Purpose"],
          rows,
        );
      }

      if (view === "workflows") {
        if (context.workflows?.enabled === false)
          return "Workflows are disabled. Enable workflows.enabled in orchestrator.json.";
        const workflows = listWorkflows();
        if (format === "json") return JSON.stringify(workflows, null, 2);
        if (workflows.length === 0) return "No workflows registered.";
        const rows = workflows.map((w) => [
          w.id,
          w.name,
          String(w.steps.length),
          w.description,
        ]);
        return renderMarkdownTable(
          ["ID", "Name", "Steps", "Description"],
          rows,
        );
      }

      if (view === "models") {
        const client = context.client;
        if (!client) return "OpenCode client not available; restart OpenCode.";

        const { providers } = await fetchProviders(client, context.directory);
        const scoped =
          args.providers && args.providers.length > 0
            ? providers.filter((p) =>
                args.providers!.some(
                  (id) => id.toLowerCase() === p.id.toLowerCase(),
                ),
              )
            : filterProviders(providers, args.scope ?? "configured");

        let models = flattenProviders(scoped);
        const q = args.query?.trim().toLowerCase();
        if (q) {
          models = models.filter(
            (m) =>
              m.full.toLowerCase().includes(q) ||
              m.providerID.toLowerCase().includes(q) ||
              m.modelID.toLowerCase().includes(q) ||
              m.name.toLowerCase().includes(q),
          );
        }

        models.sort((a, b) => a.full.localeCompare(b.full));
        const limited = models.slice(0, Math.max(1, args.limit ?? 100));

        if (format === "json") return JSON.stringify(limited, null, 2);

        const rows = limited.map((m) => [
          m.full,
          m.name,
          String(m.limit?.context ?? ""),
          m.capabilities?.input?.image ? "yes" : "no",
          m.capabilities?.attachment ? "yes" : "no",
          m.capabilities?.toolcall ? "yes" : "no",
          m.capabilities?.reasoning ? "yes" : "no",
          m.status,
        ]);

        return [
          renderMarkdownTable(
            [
              "Model (provider/model)",
              "Name",
              "Ctx",
              "Vision",
              "Attach",
              "Tools",
              "Reason",
              "Status",
            ],
            rows,
          ),
          "",
          "Tip: You can pin a specific model in your profile config.",
        ].join("\n");
      }

      if (view === "output") {
        const limit = Math.max(1, args.limit ?? 20);
        const after =
          typeof args.after === "number" && Number.isFinite(args.after)
            ? args.after
            : 0;

        const tasks = workerJobs
          .list({ limit: Math.max(limit, 50) })
          .filter((t) =>
            after ? t.startedAt > after || (t.finishedAt ?? 0) > after : true,
          )
          .slice(0, limit);
        const logs = getLogBuffer(Math.max(limit * 2, 50)).filter((l) =>
          after ? l.at > after : true,
        );

        const payload = { tasks, logs };
        if (format === "json") return JSON.stringify(payload, null, 2);

        const taskRows = tasks.map((t) => [
          t.id,
          t.workerId,
          t.status,
          new Date(t.startedAt).toISOString(),
          t.durationMs ? `${t.durationMs}` : "",
          (t.message ?? "").slice(0, 60).replace(/\s+/g, " "),
        ]);
        const logRows = logs
          .slice()
          .reverse()
          .slice(0, limit)
          .reverse()
          .map((l) => [
            new Date(l.at).toISOString(),
            l.level,
            l.message.slice(0, 200),
          ]);

        return [
          "# Orchestrator Output",
          "",
          "## Tasks",
          taskRows.length
            ? renderMarkdownTable(
                ["Task", "Worker", "Status", "Started", "ms", "Message"],
                taskRows,
              )
            : "(none)",
          "",
          "## Logs",
          logRows.length
            ? renderMarkdownTable(["Time", "Level", "Message"], logRows)
            : "(none)",
        ].join("\n");
      }

      if (view === "status") {
        const workers = context.workerPool.toJSON();
        const tasks = workerJobs.list({ limit: Math.max(1, args.limit ?? 20) });
        const payload = { workers, tasks };
        if (format === "json") return JSON.stringify(payload, null, 2);

        const workerRows = workers.map((w: any) => [
          String(w.id),
          String(w.status),
          String(w.model),
          w.supportsVision ? "yes" : "no",
          w.supportsWeb ? "yes" : "no",
          String(w.port ?? ""),
        ]);
        const taskRows = tasks.map((t) => [
          t.id,
          t.workerId,
          t.status,
          new Date(t.startedAt).toISOString(),
          t.durationMs ? `${t.durationMs}` : "",
          (t.message ?? "").slice(0, 60).replace(/\s+/g, " "),
        ]);

        return [
          "# Orchestrator Status",
          "",
          "## Workers",
          workerRows.length
            ? renderMarkdownTable(
                ["Worker", "Status", "Model", "Vision", "Web", "Port"],
                workerRows,
              )
            : "(none)",
          "",
          "## Recent Tasks",
          taskRows.length
            ? renderMarkdownTable(
                ["Task", "Worker", "Status", "Started", "ms", "Message"],
                taskRows,
              )
            : "(none)",
        ].join("\n");
      }

      // tasks (default)
      const limit = args.limit ?? 20;
      const tasks = workerJobs.list({ workerId: args.workerId, limit });
      if (format === "json") return JSON.stringify(tasks, null, 2);
      if (tasks.length === 0) return "No tasks recorded yet.";
      const rows = tasks.map((t) => [
        t.id,
        t.workerId,
        t.status,
        new Date(t.startedAt).toISOString(),
        t.durationMs ? `${t.durationMs}` : "",
        (t.message ?? "").slice(0, 60).replace(/\s+/g, " "),
      ]);
      return renderMarkdownTable(
        ["Task", "Worker", "Status", "Started", "ms", "Message"],
        rows,
      );
    },
  });

  const taskCancel: ToolDefinition = tool({
    description:
      "Cancel a running task (best-effort; may not stop underlying worker execution).",
    args: {
      taskId: tool.schema.string().optional().describe("Task id"),
      taskIds: tool.schema
        .array(tool.schema.string())
        .optional()
        .describe("Multiple task ids"),
      reason: tool.schema
        .string()
        .optional()
        .describe("Optional cancel reason"),
    },
    async execute(args) {
      const ids = args.taskId ? [args.taskId] : (args.taskIds ?? []);
      if (ids.length === 0) return "Missing taskId/taskIds.";
      for (const id of ids) {
        workerJobs.cancel(id, { reason: args.reason });
      }
      return ids.length === 1
        ? `Canceled task "${ids[0]}"`
        : `Canceled ${ids.length} task(s)`;
    },
  });

  return { taskStart, taskAwait, taskPeek, taskList, taskCancel };
}

const defaultTools: TaskTools = createTaskTools(getOrchestratorContext());

export const taskStart: ToolDefinition = defaultTools.taskStart;
export const taskAwait: ToolDefinition = defaultTools.taskAwait;
export const taskPeek: ToolDefinition = defaultTools.taskPeek;
export const taskList: ToolDefinition = defaultTools.taskList;
export const taskCancel: ToolDefinition = defaultTools.taskCancel;
