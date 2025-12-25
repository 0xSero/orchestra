import type { LinearIntegrationConfig } from "../types";

export type LinearConfig = {
  apiKey: string;
  teamId: string;
  apiUrl: string;
  projectPrefix?: string;
};

type LinearGraphQLError = {
  message: string;
};

type LinearGraphQLResponse<T> = {
  data?: T;
  errors?: LinearGraphQLError[];
};

export type LinearIssue = {
  id: string;
  title?: string;
  url?: string;
  identifier?: string;
};

export type LinearProject = {
  id: string;
  name?: string;
  state?: string;
  url?: string;
  progress?: number | null;
  issueCount?: number | null;
  completedIssueCount?: number | null;
};

export type LinearProjectStatus = {
  project: LinearProject;
};

export type LinearTeamState = {
  id: string;
  name?: string;
  type?: string;
};

const DEFAULT_API_URL = "https://api.linear.app/graphql";

export function loadLinearConfigFromEnv(): LinearConfig | undefined {
  const apiKey = process.env.LINEAR_API_KEY;
  const teamId = process.env.LINEAR_TEAM_ID;
  if (!apiKey || !teamId) return undefined;
  return {
    apiKey,
    teamId,
    apiUrl: process.env.LINEAR_API_URL || DEFAULT_API_URL,
    projectPrefix: process.env.LINEAR_PROJECT_PREFIX || undefined,
  };
}

export function resolveLinearConfig(input?: LinearIntegrationConfig): LinearConfig {
  if (input?.enabled === false) {
    throw new Error("Linear integration is disabled.");
  }

  const apiKey = input?.apiKey || process.env.LINEAR_API_KEY;
  const teamId = input?.teamId || process.env.LINEAR_TEAM_ID;
  if (!apiKey || !teamId) {
    throw new Error("Missing Linear credentials. Set LINEAR_API_KEY and LINEAR_TEAM_ID.");
  }

  return {
    apiKey,
    teamId,
    apiUrl: input?.apiUrl || process.env.LINEAR_API_URL || DEFAULT_API_URL,
    projectPrefix: input?.projectPrefix || process.env.LINEAR_PROJECT_PREFIX || undefined,
  };
}

async function linearRequest<T>(
  cfg: LinearConfig,
  query: string,
  variables?: Record<string, unknown>
): Promise<T> {
  const response = await fetch(cfg.apiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: cfg.apiKey,
    },
    body: JSON.stringify({ query, variables }),
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Linear API error: HTTP ${response.status} ${response.statusText}`);
  }

  let payload: LinearGraphQLResponse<T>;
  try {
    payload = JSON.parse(text) as LinearGraphQLResponse<T>;
  } catch {
    throw new Error("Linear API error: Invalid JSON response.");
  }

  if (payload.errors && payload.errors.length > 0) {
    throw new Error(`Linear API error: ${payload.errors.map((e) => e.message).join("; ")}`);
  }
  if (!payload.data) {
    throw new Error("Linear API error: Missing response data.");
  }
  return payload.data;
}

function applyProjectPrefix(cfg: LinearConfig, name: string): string {
  const prefix = cfg.projectPrefix;
  if (!prefix) return name;
  const normalized = `${prefix}-`;
  if (name.startsWith(normalized)) return name;
  return `${normalized}${name}`;
}

export async function getViewer(cfg: LinearConfig): Promise<{ id: string; name?: string; email?: string }> {
  const data = await linearRequest<{ viewer: { id: string; name?: string; email?: string } }>(
    cfg,
    `query Viewer { viewer { id name email } }`
  );
  return data.viewer;
}

export async function createProject(input: {
  cfg: LinearConfig;
  name: string;
  description?: string;
  teamId?: string;
}): Promise<{ projectId: string; name?: string; url?: string }> {
  const name = applyProjectPrefix(input.cfg, input.name);
  const data = await linearRequest<{
    projectCreate: { success: boolean; project?: LinearProject };
  }>(
    input.cfg,
    `mutation CreateProject($input: ProjectCreateInput!) {
      projectCreate(input: $input) {
        success
        project { id name url }
      }
    }`,
    {
      input: {
        name,
        description: input.description,
        teamId: input.teamId ?? input.cfg.teamId,
      },
    }
  );

  const project = data.projectCreate.project;
  if (!project?.id) throw new Error("Linear API error: Project not created.");
  return { projectId: project.id, name: project.name, url: project.url ?? undefined };
}

export async function createIssue(input: {
  cfg: LinearConfig;
  title: string;
  description?: string;
  projectId?: string;
  priority?: number;
}): Promise<{ issueId: string; identifier?: string; url?: string }> {
  const data = await linearRequest<{
    issueCreate: { success: boolean; issue?: LinearIssue };
  }>(
    input.cfg,
    `mutation CreateIssue($input: IssueCreateInput!) {
      issueCreate(input: $input) {
        success
        issue { id identifier url }
      }
    }`,
    {
      input: {
        title: input.title,
        description: input.description,
        teamId: input.cfg.teamId,
        projectId: input.projectId,
        priority: input.priority,
      },
    }
  );

  const issue = data.issueCreate.issue;
  if (!issue?.id) throw new Error("Linear API error: Issue not created.");
  return { issueId: issue.id, identifier: issue.identifier, url: issue.url ?? undefined };
}

export async function updateIssue(input: {
  cfg: LinearConfig;
  issueId: string;
  title?: string;
  description?: string;
  stateId?: string;
  priority?: number;
  estimate?: number;
  labelIds?: string[];
  projectId?: string;
  assigneeId?: string;
}): Promise<{ issueId: string; title?: string; url?: string }> {
  const data = await linearRequest<{
    issueUpdate: { success: boolean; issue?: LinearIssue };
  }>(
    input.cfg,
    `mutation UpdateIssue($input: IssueUpdateInput!) {
      issueUpdate(input: $input) {
        success
        issue { id title url }
      }
    }`,
    {
      input: {
        id: input.issueId,
        title: input.title,
        description: input.description,
        stateId: input.stateId,
        priority: input.priority,
        estimate: input.estimate,
        labelIds: input.labelIds,
        projectId: input.projectId,
        assigneeId: input.assigneeId,
      },
    }
  );

  const issue = data.issueUpdate.issue;
  if (!issue?.id) throw new Error("Linear API error: Issue not updated.");
  return { issueId: issue.id, title: issue.title, url: issue.url ?? undefined };
}

export async function addComment(input: {
  cfg: LinearConfig;
  issueId: string;
  body: string;
}): Promise<{ commentId: string; url?: string }> {
  const data = await linearRequest<{
    commentCreate: { success: boolean; comment?: { id: string; url?: string } };
  }>(
    input.cfg,
    `mutation AddComment($input: CommentCreateInput!) {
      commentCreate(input: $input) {
        success
        comment { id url }
      }
    }`,
    {
      input: {
        issueId: input.issueId,
        body: input.body,
      },
    }
  );

  const comment = data.commentCreate.comment;
  if (!comment?.id) throw new Error("Linear API error: Comment not created.");
  return { commentId: comment.id, url: comment.url ?? undefined };
}

export async function getProjectStatus(input: {
  cfg: LinearConfig;
  projectId: string;
}): Promise<LinearProjectStatus> {
  const data = await linearRequest<{ project: LinearProject }>(
    input.cfg,
    `query ProjectStatus($id: ID!) {
      project(id: $id) {
        id
        name
        state
        url
        progress
        issueCount
        completedIssueCount
      }
    }`,
    { id: input.projectId }
  );

  if (!data.project?.id) throw new Error("Linear API error: Project not found.");
  return { project: data.project };
}

export async function getTeamStates(input: {
  cfg: LinearConfig;
  teamId?: string;
}): Promise<LinearTeamState[]> {
  const data = await linearRequest<{
    team: { states: { nodes: LinearTeamState[] } };
  }>(
    input.cfg,
    `query TeamStates($id: ID!) {
      team(id: $id) {
        states {
          nodes { id name type }
        }
      }
    }`,
    { id: input.teamId ?? input.cfg.teamId }
  );

  return data.team?.states?.nodes ?? [];
}

function normalizeStatus(status: string): string {
  return status.trim().toLowerCase().replace(/\s+/g, "_");
}

export async function syncTaskStatus(input: {
  cfg: LinearConfig;
  issueId: string;
  status: string;
}): Promise<{ issueId: string; stateId: string }> {
  const states = await getTeamStates({ cfg: input.cfg });
  const desired = normalizeStatus(input.status);

  const typeMap: Record<string, string> = {
    backlog: "backlog",
    todo: "unstarted",
    unstarted: "unstarted",
    in_progress: "started",
    started: "started",
    review: "started",
    done: "completed",
    completed: "completed",
    canceled: "canceled",
  };

  const desiredType = typeMap[desired];
  const byType = desiredType
    ? states.find((state) => state.type?.toLowerCase() === desiredType)
    : undefined;
  const byName = states.find((state) => normalizeStatus(state.name || "") === desired);
  const chosen = byType || byName;
  if (!chosen?.id) {
    throw new Error(`Linear API error: No matching state for status '${input.status}'.`);
  }

  await updateIssue({ cfg: input.cfg, issueId: input.issueId, stateId: chosen.id });
  return { issueId: input.issueId, stateId: chosen.id };
}

export async function getIssueLabelIds(input: {
  cfg: LinearConfig;
  issueId: string;
}): Promise<string[]> {
  const data = await linearRequest<{
    issue: { labels: { nodes: Array<{ id: string }> } };
  }>(
    input.cfg,
    `query IssueLabels($id: ID!) {
      issue(id: $id) {
        labels { nodes { id } }
      }
    }`,
    { id: input.issueId }
  );

  return data.issue?.labels?.nodes?.map((label) => label.id) ?? [];
}

export async function addLabel(input: {
  cfg: LinearConfig;
  issueId: string;
  labelId: string;
}): Promise<{ issueId: string; labelIds: string[] }> {
  const existing = await getIssueLabelIds({ cfg: input.cfg, issueId: input.issueId });
  const next = Array.from(new Set([...existing, input.labelId]));
  await updateIssue({ cfg: input.cfg, issueId: input.issueId, labelIds: next });
  return { issueId: input.issueId, labelIds: next };
}

export async function setEstimate(input: {
  cfg: LinearConfig;
  issueId: string;
  estimate: number;
}): Promise<{ issueId: string; estimate: number }> {
  await updateIssue({ cfg: input.cfg, issueId: input.issueId, estimate: input.estimate });
  return { issueId: input.issueId, estimate: input.estimate };
}
