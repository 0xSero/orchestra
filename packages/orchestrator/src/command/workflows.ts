import { tool, type ToolDefinition } from "@opencode-ai/plugin";
import { getWorkflow, listWorkflows } from "../workflows/engine";
import { renderMarkdownTable } from "./markdown";
import type { WorkflowRunInput } from "../workflows/types";
import type { OrchestratorContext } from "../context/orchestrator-context";
import { getOrchestratorContext } from "./state";
import { resolveWorkflowLimits, runWorkflowWithContext } from "../workflows/runner";

type WorkflowTools = {
  listWorkflowsTool: ToolDefinition;
  runWorkflowTool: ToolDefinition;
};

function truncate(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars)}…`;
}

export function createWorkflowTools(context: OrchestratorContext): WorkflowTools {
  const listWorkflowsTool: ToolDefinition = tool({
    description: "List available orchestrator workflows (discovery + summary).",
    args: {
      format: tool.schema.enum(["markdown", "json"]).optional().describe("Output format (default: markdown)"),
    },
    async execute(args) {
      if (context.workflows?.enabled === false) {
        return "Workflows are disabled. Enable them in orchestrator.json under workflows.enabled.";
      }

      const format: "markdown" | "json" = args.format ?? context.defaultListFormat;
      const workflows = listWorkflows();
      if (workflows.length === 0) return "No workflows registered.";

      if (format === "json") return JSON.stringify(workflows, null, 2);
      const rows = workflows.map((w) => [w.id, w.name, String(w.steps.length), w.description]);
      return renderMarkdownTable(["ID", "Name", "Steps", "Description"], rows);
    },
  });

  const runWorkflowTool: ToolDefinition = tool({
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
      if (context.workflows?.enabled === false) {
        return "Workflows are disabled. Enable them in orchestrator.json under workflows.enabled.";
      }

      const workflow = getWorkflow(args.workflowId);
      if (!workflow) return `Unknown workflow "${args.workflowId}". Run list_workflows to see available workflows.`;

      const limits = resolveWorkflowLimits(context, args.workflowId);
      const input: WorkflowRunInput = {
        workflowId: args.workflowId,
        task: args.task,
        attachments: args.attachments,
        autoSpawn: args.autoSpawn ?? true,
        limits,
      };

      const result = await runWorkflowWithContext(context, input, { sessionId: ctx?.sessionID });

      const client = context.client;
      if (client) {
        const failed = result.steps.some((step) => step.status === "error");
        void client.tui
          .showToast({
            body: {
              message: failed
                ? `Workflow "${result.workflowName}" completed with errors`
                : `Workflow "${result.workflowName}" completed`,
              variant: failed ? "warning" : "success",
            },
          })
          .catch(() => {});
      }

      const format: "markdown" | "json" = args.format ?? context.defaultListFormat;
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

  return { listWorkflowsTool, runWorkflowTool };
}

const defaultTools: WorkflowTools = createWorkflowTools(getOrchestratorContext());

export const listWorkflowsTool: ToolDefinition = defaultTools.listWorkflowsTool;
export const runWorkflowTool: ToolDefinition = defaultTools.runWorkflowTool;
