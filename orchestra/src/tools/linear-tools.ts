import { tool } from "@opencode-ai/plugin";
import {
  addComment,
  addLabel,
  createIssue,
  getIssue,
  type LinearConfig,
  resolveLinearConfig,
  setEstimate,
  syncTaskStatus,
  updateIssue,
} from "../integrations/linear";
import type { LinearIntegrationConfig } from "../types";

type ToolDefinition = ReturnType<typeof tool>;

function serialize(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

export type LinearToolsDeps = {
  config?: LinearIntegrationConfig;
  api?: {
    resolveConfig?: typeof resolveLinearConfig;
    createIssue?: typeof createIssue;
    updateIssue?: typeof updateIssue;
    addComment?: typeof addComment;
    addLabel?: typeof addLabel;
    setEstimate?: typeof setEstimate;
    syncTaskStatus?: typeof syncTaskStatus;
    getIssue?: typeof getIssue;
  };
};

/** Create Linear tools for orchestrator (write) and workers (read). */
export function createLinearTools(deps: LinearToolsDeps): {
  orchestrator: Record<string, ToolDefinition>;
  workers: Record<string, ToolDefinition>;
} {
  const api = deps.api ?? {};
  let cfg: LinearConfig | undefined;
  const getConfig = (): LinearConfig => {
    if (!cfg) cfg = (api.resolveConfig ?? resolveLinearConfig)(deps.config);
    return cfg;
  };

  // === WRITE TOOLS (orchestrator only) ===

  const linearCreateIssue = tool({
    description: "Create a new issue in Linear",
    args: {
      title: tool.schema.string().describe("Issue title"),
      description: tool.schema.string().optional().describe("Issue description (markdown)"),
      priority: tool.schema.number().optional().describe("Priority (0=none, 1=urgent, 2=high, 3=medium, 4=low)"),
      estimate: tool.schema.number().optional().describe("Estimate points"),
    },
    async execute(args) {
      const issue = await (api.createIssue ?? createIssue)({
        cfg: getConfig(),
        title: args.title,
        description: args.description,
        priority: args.priority,
        estimate: args.estimate,
      });
      return serialize({
        id: issue.issueId,
        identifier: issue.identifier,
        title: args.title,
        url: issue.url,
      });
    },
  });

  const linearUpdateIssue = tool({
    description: "Update an existing Linear issue",
    args: {
      issueId: tool.schema.string().describe("Issue ID"),
      title: tool.schema.string().optional().describe("New title"),
      description: tool.schema.string().optional().describe("New description"),
      priority: tool.schema.number().optional().describe("New priority"),
    },
    async execute(args) {
      const issue = await (api.updateIssue ?? updateIssue)({
        cfg: getConfig(),
        issueId: args.issueId,
        title: args.title,
        description: args.description,
        priority: args.priority,
      });
      return serialize({ id: issue.issueId, title: issue.title ?? args.title, url: issue.url });
    },
  });

  const linearAddComment = tool({
    description: "Add a comment to a Linear issue",
    args: {
      issueId: tool.schema.string().describe("Issue ID"),
      body: tool.schema.string().describe("Comment body (markdown)"),
    },
    async execute(args) {
      const comment = await (api.addComment ?? addComment)({
        cfg: getConfig(),
        issueId: args.issueId,
        body: args.body,
      });
      return serialize({ id: comment.commentId, issueId: args.issueId, url: comment.url });
    },
  });

  const linearAddLabel = tool({
    description: "Add a label to a Linear issue",
    args: {
      issueId: tool.schema.string().describe("Issue ID"),
      labelId: tool.schema.string().describe("Label ID to add"),
    },
    async execute(args) {
      const issue = await (api.addLabel ?? addLabel)({
        cfg: getConfig(),
        issueId: args.issueId,
        labelId: args.labelId,
      });
      return serialize({ id: issue.issueId, labelIds: issue.labelIds });
    },
  });

  const linearSetEstimate = tool({
    description: "Set estimate points on a Linear issue",
    args: {
      issueId: tool.schema.string().describe("Issue ID"),
      estimate: tool.schema.number().describe("Estimate points"),
    },
    async execute(args) {
      const issue = await (api.setEstimate ?? setEstimate)({
        cfg: getConfig(),
        issueId: args.issueId,
        estimate: args.estimate,
      });
      return serialize({ id: issue.issueId, estimate: issue.estimate });
    },
  });

  const linearSyncStatus = tool({
    description: "Sync a task status to Linear (maps status labels to workflow states)",
    args: {
      issueId: tool.schema.string().describe("Issue ID"),
      status: tool.schema
        .string()
        .describe("Status label (e.g., 'todo', 'in_progress', 'in-progress', 'done', 'canceled')"),
    },
    async execute(args) {
      const issue = await (api.syncTaskStatus ?? syncTaskStatus)({
        cfg: getConfig(),
        issueId: args.issueId,
        status: args.status,
      });
      return serialize({ id: issue.issueId, stateId: issue.stateId, status: args.status });
    },
  });

  // === READ/UPDATE TOOLS (available to all workers) ===

  const linearGetConfig = tool({
    description: "Check if Linear is configured and get team info",
    args: {},
    async execute() {
      try {
        const config = getConfig();
        return serialize({ configured: true, teamId: config.teamId, apiUrl: config.apiUrl });
      } catch {
        return serialize({ configured: false, error: "Linear not configured" });
      }
    },
  });

  const linearGetIssue = tool({
    description: "Get details of a Linear issue by ID",
    args: {
      issueId: tool.schema.string().describe("Issue ID or identifier (e.g., 'ABC-123')"),
    },
    async execute(args) {
      const issue = await (api.getIssue ?? getIssue)({ cfg: getConfig(), issueId: args.issueId });
      return serialize(issue);
    },
  });

  // Shared tools that workers can also use
  const sharedTools = {
    linear_get_config: linearGetConfig,
    linear_get_issue: linearGetIssue,
    linear_update_issue: linearUpdateIssue,
    linear_add_comment: linearAddComment,
    linear_add_label: linearAddLabel,
    linear_set_estimate: linearSetEstimate,
    linear_sync_status: linearSyncStatus,
  };

  return {
    // Orchestrator gets create (+ all shared tools)
    orchestrator: {
      linear_create_issue: linearCreateIssue,
      ...sharedTools,
    },
    // Workers get read + update tools (no create/delete)
    workers: sharedTools,
  };
}
