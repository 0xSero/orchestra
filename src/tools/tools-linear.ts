import { tool } from "@opencode-ai/plugin";
import {
  addComment,
  addLabel,
  createIssue,
  createProject,
  getProjectStatus,
  resolveLinearConfig,
  setEstimate,
  syncTaskStatus,
  updateIssue,
} from "../integrations/linear";
import { getIntegrationsConfig } from "./state";

function getLinearConfig() {
  return resolveLinearConfig(getIntegrationsConfig()?.linear);
}

export const linearCreateProject = tool({
  description: "Create a Linear project (real API).",
  args: {
    name: tool.schema.string().describe("Project name"),
    description: tool.schema.string().optional().describe("Project description"),
  },
  async execute(args) {
    const cfg = getLinearConfig();
    const result = await createProject({
      cfg,
      name: args.name,
      description: args.description,
    });
    return JSON.stringify(result, null, 2);
  },
});

export const linearCreateIssue = tool({
  description: "Create a Linear issue (real API).",
  args: {
    title: tool.schema.string().describe("Issue title"),
    description: tool.schema.string().optional().describe("Issue description"),
    projectId: tool.schema.string().optional().describe("Optional project ID"),
    priority: tool.schema.number().optional().describe("Priority (Linear scale)"),
  },
  async execute(args) {
    const cfg = getLinearConfig();
    const result = await createIssue({
      cfg,
      title: args.title,
      description: args.description,
      projectId: args.projectId,
      priority: args.priority,
    });
    return JSON.stringify(result, null, 2);
  },
});

export const linearUpdateIssue = tool({
  description: "Update a Linear issue (real API).",
  args: {
    issueId: tool.schema.string().describe("Issue ID"),
    title: tool.schema.string().optional().describe("Updated title"),
    description: tool.schema.string().optional().describe("Updated description"),
    stateId: tool.schema.string().optional().describe("Linear state ID"),
    priority: tool.schema.number().optional().describe("Priority (Linear scale)"),
    estimate: tool.schema.number().optional().describe("Estimate value"),
    labelIds: tool.schema.array(tool.schema.string()).optional().describe("Label IDs"),
    projectId: tool.schema.string().optional().describe("Project ID"),
    assigneeId: tool.schema.string().optional().describe("Assignee ID"),
  },
  async execute(args) {
    const cfg = getLinearConfig();
    const result = await updateIssue({
      cfg,
      issueId: args.issueId,
      title: args.title,
      description: args.description,
      stateId: args.stateId,
      priority: args.priority,
      estimate: args.estimate,
      labelIds: args.labelIds,
      projectId: args.projectId,
      assigneeId: args.assigneeId,
    });
    return JSON.stringify(result, null, 2);
  },
});

export const linearAddComment = tool({
  description: "Add a comment to a Linear issue (real API).",
  args: {
    issueId: tool.schema.string().describe("Issue ID"),
    body: tool.schema.string().describe("Comment body"),
  },
  async execute(args) {
    const cfg = getLinearConfig();
    const result = await addComment({
      cfg,
      issueId: args.issueId,
      body: args.body,
    });
    return JSON.stringify(result, null, 2);
  },
});

export const linearGetProjectStatus = tool({
  description: "Fetch Linear project status (real API).",
  args: {
    projectId: tool.schema.string().describe("Project ID"),
  },
  async execute(args) {
    const cfg = getLinearConfig();
    const result = await getProjectStatus({
      cfg,
      projectId: args.projectId,
    });
    return JSON.stringify(result, null, 2);
  },
});

export const linearSyncTaskStatus = tool({
  description: "Sync a Linear issue to a status name (real API).",
  args: {
    issueId: tool.schema.string().describe("Issue ID"),
    status: tool.schema.string().describe("Status name (e.g. In Progress, Done)"),
  },
  async execute(args) {
    const cfg = getLinearConfig();
    const result = await syncTaskStatus({
      cfg,
      issueId: args.issueId,
      status: args.status,
    });
    return JSON.stringify(result, null, 2);
  },
});

export const linearAddLabel = tool({
  description: "Add an existing label to a Linear issue (real API).",
  args: {
    issueId: tool.schema.string().describe("Issue ID"),
    labelId: tool.schema.string().describe("Label ID"),
  },
  async execute(args) {
    const cfg = getLinearConfig();
    const result = await addLabel({
      cfg,
      issueId: args.issueId,
      labelId: args.labelId,
    });
    return JSON.stringify(result, null, 2);
  },
});

export const linearSetEstimate = tool({
  description: "Set estimate on a Linear issue (real API).",
  args: {
    issueId: tool.schema.string().describe("Issue ID"),
    estimate: tool.schema.number().describe("Estimate value"),
  },
  async execute(args) {
    const cfg = getLinearConfig();
    const result = await setEstimate({
      cfg,
      issueId: args.issueId,
      estimate: args.estimate,
    });
    return JSON.stringify(result, null, 2);
  },
});
