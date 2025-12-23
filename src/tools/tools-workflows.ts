import { tool } from "@opencode-ai/plugin";
import { getWorkflow, listWorkflows, runWorkflow } from "../workflows/engine";
import { renderMarkdownTable } from "./markdown";
import {
  getClient,
  getDefaultListFormat,
  getDirectory,
  getProfiles,
  getSecurityConfig,
  getSpawnDefaults,
  getWorkflowsConfig,
} from "./state";
import { spawnWorker, sendToWorker } from "../workers/spawner";
import { workerPool } from "../core/worker-pool";
import type { WorkflowRunInput, WorkflowSecurityLimits } from "../workflows/types";

const defaultLimits: WorkflowSecurityLimits = {
  maxSteps: 4,
  maxTaskChars: 12000,
  maxCarryChars: 24000,
  perStepTimeoutMs: 120_000,
};

function clampLimit(value: number | undefined, cap: number | undefined, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return cap ?? fallback;
  if (typeof cap === "number" && Number.isFinite(cap)) return Math.min(value, cap);
  return value;
}

function getEffectiveLimits(workflowId: string): WorkflowSecurityLimits {
  const security = getSecurityConfig()?.workflows;
  const workflows = getWorkflowsConfig();
  const roocode = workflowId === "roocode-boomerang" ? workflows?.roocodeBoomerang : undefined;

  const maxStepsCap = security?.maxSteps ?? defaultLimits.maxSteps;
  const maxTaskCap = security?.maxTaskChars ?? defaultLimits.maxTaskChars;
  const maxCarryCap = security?.maxCarryChars ?? defaultLimits.maxCarryChars;
  const perStepCap = security?.perStepTimeoutMs ?? defaultLimits.perStepTimeoutMs;

  return {
    maxSteps: clampLimit(roocode?.maxSteps, maxStepsCap, defaultLimits.maxSteps),
    maxTaskChars: clampLimit(roocode?.maxTaskChars, maxTaskCap, defaultLimits.maxTaskChars),
    maxCarryChars: clampLimit(roocode?.maxCarryChars, maxCarryCap, defaultLimits.maxCarryChars),
    perStepTimeoutMs: clampLimit(roocode?.perStepTimeoutMs, perStepCap, defaultLimits.perStepTimeoutMs),
  };
}

async function ensureWorker(workerId: string, autoSpawn: boolean): Promise<string> {
  const existing = workerPool.get(workerId);
  if (existing && existing.status !== "error" && existing.status !== "stopped") {
    return existing.profile.id;
  }
  if (!autoSpawn) {
    throw new Error(`Worker "${workerId}" is not running. Spawn it first or pass autoSpawn=true.`);
  }

  const profile = getProfiles()[workerId];
  if (!profile) {
    throw new Error(`Unknown worker profile "${workerId}".`);
  }

  const { basePort, timeout } = getSpawnDefaults();
  const instance = await spawnWorker(profile, {
    basePort,
    timeout,
    directory: getDirectory(),
    client: getClient(),
  });
  return instance.profile.id;
}

function truncate(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars)}…`;
}

export const listWorkflowsTool = tool({
  description: "List available orchestrator workflows (discovery + summary).",
  args: {
    format: tool.schema.enum(["markdown", "json"]).optional().describe("Output format (default: markdown)"),
  },
  async execute(args) {
    if (getWorkflowsConfig()?.enabled === false) {
      return "Workflows are disabled. Enable them in orchestrator.json under workflows.enabled.";
    }

    const format: "markdown" | "json" = args.format ?? getDefaultListFormat();
    const workflows = listWorkflows();
    if (workflows.length === 0) return "No workflows registered.";

    if (format === "json") return JSON.stringify(workflows, null, 2);
    const rows = workflows.map((w) => [w.id, w.name, String(w.steps.length), w.description]);
    return renderMarkdownTable(["ID", "Name", "Steps", "Description"], rows);
  },
});

export const runWorkflowTool = tool({
  description: "Run a named orchestrator workflow (e.g., roocode-boomerang) with security limits.",
  args: {
    workflowId: tool.schema.string().describe("Workflow ID to run"),
    task: tool.schema.string().describe("Task to execute"),
    autoSpawn: tool.schema.boolean().optional().describe("Auto-spawn missing workers (default: true)"),
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
      .describe("Optional attachments to forward (first step only)"),
    format: tool.schema.enum(["markdown", "json"]).optional().describe("Output format (default: markdown)"),
  },
  async execute(args, ctx) {
    if (getWorkflowsConfig()?.enabled === false) {
      return "Workflows are disabled. Enable them in orchestrator.json under workflows.enabled.";
    }

    const workflow = getWorkflow(args.workflowId);
    if (!workflow) return `Unknown workflow "${args.workflowId}". Run list_workflows to see available workflows.`;

    const limits = getEffectiveLimits(args.workflowId);
    const input: WorkflowRunInput = {
      workflowId: args.workflowId,
      task: args.task,
      attachments: args.attachments,
      autoSpawn: args.autoSpawn ?? true,
      limits,
    };

    const result = await runWorkflow(input, {
      resolveWorker: async (workerId, autoSpawn) => {
        const existing = workerPool.get(workerId);
        const resolved = await ensureWorker(workerId, autoSpawn);
        const instance = workerPool.get(resolved);
        if (ctx?.sessionID && !existing && instance?.modelResolution !== "reused existing worker") {
          if (instance) { workerPool.trackOwnership(ctx.sessionID, instance.profile.id); }
        }
        return resolved;
      },
      sendToWorker: async (workerId, message, options) =>
        sendToWorker(workerId, message, { attachments: options.attachments, timeout: options.timeoutMs }),
    });

    const format: "markdown" | "json" = args.format ?? getDefaultListFormat();
    if (format === "json") return JSON.stringify(result, null, 2);

    const lines: string[] = [];
    lines.push(`# Workflow: ${result.workflowName}`, "");
    lines.push(`- ID: ${result.workflowId}`);
    lines.push(`- Steps: ${result.steps.length}`);
    lines.push(`- Duration: ${result.finishedAt - result.startedAt}ms`, "");

    for (const step of result.steps) {
      lines.push(`## ${step.title} (${step.workerId})`);
      lines.push(`- Status: ${step.status}`);
      lines.push(`- Duration: ${step.durationMs}ms`);
      if (step.error) {
        lines.push("", `Error: ${step.error}`, "");
        continue;
      }
      if (step.response) {
        lines.push("", truncate(step.response, 4000), "");
      }
    }

    lines.push(
      "",
      `Limits: steps=${limits.maxSteps}, task=${limits.maxTaskChars} chars, carry=${limits.maxCarryChars} chars, timeout=${limits.perStepTimeoutMs}ms`
    );
    return lines.join("\n");
  },
});
