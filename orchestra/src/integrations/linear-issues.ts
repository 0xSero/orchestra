import { linearRequest } from "./linear-request";
import { getTeamStates, normalizeStatus } from "./linear-teams";
import type { LinearConfig, LinearIssue } from "./linear-types";

/** Create a new issue in Linear. */
export const createIssue = async (input: {
  cfg: LinearConfig;
  title: string;
  description?: string;
  projectId?: string;
  priority?: number;
  estimate?: number;
}): Promise<{ issueId: string; identifier?: string; url?: string }> => {
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
        estimate: input.estimate,
      },
    },
  );

  const issue = data.issueCreate.issue;
  if (!issue?.id) {
    throw new Error(
      "Linear API error: Issue not created. Check LINEAR_TEAM_ID, permissions, and required fields.",
    );
  }
  return { issueId: issue.id, identifier: issue.identifier, url: issue.url ?? undefined };
};

/** Update fields on an existing Linear issue. */
export const updateIssue = async (input: {
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
}): Promise<{ issueId: string; title?: string; url?: string }> => {
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
    },
  );

  const issue = data.issueUpdate.issue;
  if (!issue?.id) {
    throw new Error(
      "Linear API error: Issue not updated. Verify the issue id and your Linear permissions.",
    );
  }
  return { issueId: issue.id, title: issue.title, url: issue.url ?? undefined };
};

/** Add a comment to a Linear issue. */
export const addComment = async (input: {
  cfg: LinearConfig;
  issueId: string;
  body: string;
}): Promise<{ commentId: string; url?: string }> => {
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
    },
  );

  const comment = data.commentCreate.comment;
  if (!comment?.id) {
    throw new Error(
      "Linear API error: Comment not created. Verify the issue id and your Linear permissions.",
    );
  }
  return { commentId: comment.id, url: comment.url ?? undefined };
};

/** Fetch a Linear issue by ID. */
export const getIssue = async (input: { cfg: LinearConfig; issueId: string }): Promise<LinearIssue> => {
  const data = await linearRequest<{ issue: LinearIssue }>(
    input.cfg,
    `query GetIssue($id: String!) {
      issue(id: $id) {
        id
        identifier
        title
        description
        url
        priority
        estimate
        state { id name type }
        labels { nodes { id name } }
        assignee { id name }
        project { id name }
      }
    }`,
    { id: input.issueId },
  );

  if (!data.issue?.id) {
    throw new Error("Linear API error: Issue not found. Confirm the issue id and team access.");
  }
  return data.issue;
};

/** Fetch label IDs currently applied to a Linear issue. */
export const getIssueLabelIds = async (input: { cfg: LinearConfig; issueId: string }): Promise<string[]> => {
  const data = await linearRequest<{
    issue: { labels: { nodes: Array<{ id: string }> } };
  }>(
    input.cfg,
    `query IssueLabels($id: ID!) {
      issue(id: $id) {
        labels { nodes { id } }
      }
    }`,
    { id: input.issueId },
  );

  return data.issue?.labels?.nodes?.map((label) => label.id) ?? [];
};

/** Add a label to a Linear issue, preserving existing labels. */
export const addLabel = async (input: {
  cfg: LinearConfig;
  issueId: string;
  labelId: string;
}): Promise<{ issueId: string; labelIds: string[] }> => {
  const existing = await getIssueLabelIds({ cfg: input.cfg, issueId: input.issueId });
  const next = Array.from(new Set([...existing, input.labelId]));
  await updateIssue({ cfg: input.cfg, issueId: input.issueId, labelIds: next });
  return { issueId: input.issueId, labelIds: next };
};

/** Set an estimate on a Linear issue. */
export const setEstimate = async (input: {
  cfg: LinearConfig;
  issueId: string;
  estimate: number;
}): Promise<{ issueId: string; estimate: number }> => {
  await updateIssue({ cfg: input.cfg, issueId: input.issueId, estimate: input.estimate });
  return { issueId: input.issueId, estimate: input.estimate };
};

/** Map a status label to a Linear workflow state and update the issue. */
export const syncTaskStatus = async (input: {
  cfg: LinearConfig;
  issueId: string;
  status: string;
}): Promise<{ issueId: string; stateId: string }> => {
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
  const byType = desiredType ? states.find((state) => state.type?.toLowerCase() === desiredType) : undefined;
  const byName = states.find((state) => normalizeStatus(state.name || "") === desired);
  const chosen = byType || byName;
  if (!chosen?.id) {
    throw new Error(
      `Linear API error: No matching state for status '${input.status}'. Use a status in the team's workflow.`,
    );
  }

  await updateIssue({ cfg: input.cfg, issueId: input.issueId, stateId: chosen.id });
  return { issueId: input.issueId, stateId: chosen.id };
};
