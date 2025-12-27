import { tool } from "@opencode-ai/plugin";
import type { OrchestratorService } from "../orchestrator";
import type { WorkerAttachment } from "../workers/prompt";
import type { WorkflowEngine } from "../workflows/factory";

export type WorkflowToolsDeps = {
  orchestrator: OrchestratorService;
  workflows?: WorkflowEngine;
};

type ToolDefinition = ReturnType<typeof tool>;

function serialize(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function attachmentSchema() {
  return tool.schema.object({
    type: tool.schema.enum(["image", "file"]),
    path: tool.schema.string().optional(),
    base64: tool.schema.string().optional(),
    mimeType: tool.schema.string().optional(),
  });
}

export function createWorkflowTools(deps: WorkflowToolsDeps): Record<string, ToolDefinition> {
  if (!deps.workflows) return {};

  const listWorkflows = tool({
    description: "List available workflows",
    args: {},
    async execute() {
      return serialize(deps.workflows?.list() ?? []);
    },
  });

  const runWorkflow = tool({
    description: "Run a workflow by id",
    args: {
      workflowId: tool.schema.string().describe("Workflow ID"),
      task: tool.schema.string().describe("Task to run"),
      attachments: tool.schema.array(attachmentSchema()).optional(),
      autoSpawn: tool.schema.boolean().optional(),
    },
    async execute(args) {
      const res = await deps.orchestrator.runWorkflow({
        workflowId: args.workflowId,
        task: args.task,
        attachments: args.attachments as WorkerAttachment[] | undefined,
        autoSpawn: args.autoSpawn,
      });
      return serialize(res);
    },
  });

  return {
    list_workflows: listWorkflows,
    run_workflow: runWorkflow,
  } as const;
}
