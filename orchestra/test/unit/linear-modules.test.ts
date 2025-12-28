import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type { LinearConfig } from "../../src/integrations/linear-types";

let scenario = "success";
let restoreFetch: (() => void) | undefined;

const buildResponseData = (query: string, variables?: Record<string, unknown>) => {
  if (query.includes("CreateIssue")) {
    if (scenario === "create-issue-missing") {
      return { issueCreate: { success: true } };
    }
    return {
      issueCreate: {
        success: true,
        issue: { id: "issue-1", identifier: "ABC-1", url: "https://linear.app/issue/1" },
      },
    };
  }

  if (query.includes("UpdateIssue")) {
    if (scenario === "update-issue-missing") {
      return { issueUpdate: { success: true } };
    }
    return {
      issueUpdate: {
        success: true,
        issue: {
          id: (variables?.input as { id?: string })?.id ?? "issue-1",
          title: (variables?.input as { title?: string })?.title ?? "Updated",
          url: "https://linear.app/issue/1",
        },
      },
    };
  }

  if (query.includes("AddComment")) {
    if (scenario === "comment-missing") {
      return { commentCreate: { success: true } };
    }
    return { commentCreate: { success: true, comment: { id: "comment-1", url: "https://linear.app/c/1" } } };
  }

  if (query.includes("IssueLabels")) {
    if (scenario === "labels-empty") {
      return { issue: { labels: { nodes: [] } } };
    }
    return { issue: { labels: { nodes: [{ id: "label-1" }] } } };
  }

  if (query.includes("GetIssue")) {
    if (scenario === "issue-missing") {
      return { issue: {} };
    }
    return {
      issue: {
        id: "issue-1",
        identifier: "ABC-1",
        title: "Issue title",
        description: "Issue description",
        url: "https://linear.app/issue/1",
        priority: 1,
        estimate: 2,
        state: { id: "state-1", name: "Todo", type: "unstarted" },
        labels: { nodes: [{ id: "label-1", name: "Bug" }] },
        assignee: { id: "user-1", name: "Test User" },
        project: { id: "project-1", name: "Project" },
      },
    };
  }

  if (query.includes("TeamStates")) {
    if (scenario === "no-states") {
      return { team: { states: { nodes: [] } } };
    }
    return {
      team: {
        states: {
          nodes: [
            { id: "state-1", name: "Todo", type: "unstarted" },
            { id: "state-2", name: "In Progress", type: "started" },
          ],
        },
      },
    };
  }

  if (query.includes("Viewer")) {
    return { viewer: { id: "viewer-1", name: "Test", email: "test@example.com" } };
  }

  if (query.includes("CreateProject")) {
    if (scenario === "project-missing") {
      return { projectCreate: { success: true } };
    }
    return {
      projectCreate: {
        success: true,
        project: {
          id: "project-1",
          name: (variables?.input as { name?: string })?.name ?? "Project",
          url: "https://linear.app/project/1",
        },
      },
    };
  }

  if (query.includes("ProjectStatus")) {
    if (scenario === "project-not-found") {
      return { project: {} };
    }
    return {
      project: {
        id: (variables?.id as string) ?? "project-1",
        name: "Project",
        state: "active",
        url: "https://linear.app/project/1",
        progress: 0.5,
        issueCount: 10,
        completedIssueCount: 4,
      },
    };
  }

  return {};
};

const withFetchStub = () => {
  const original = globalThis.fetch;
  const stubbedFetch = (async (_input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    const query = typeof body.query === "string" ? body.query : "";
    const data = buildResponseData(query, body.variables as Record<string, unknown> | undefined);
    return new Response(JSON.stringify({ data }), { status: 200 });
  }) as typeof fetch;
  stubbedFetch.preconnect = (...args: Parameters<typeof fetch.preconnect>) => {
    if (typeof original.preconnect === "function") {
      original.preconnect(...args);
    }
  };
  globalThis.fetch = stubbedFetch;
  return () => {
    globalThis.fetch = original;
  };
};

beforeEach(() => {
  restoreFetch = withFetchStub();
});

afterEach(() => {
  restoreFetch?.();
  restoreFetch = undefined;
});

const cfg: LinearConfig = {
  apiUrl: "https://linear.test/graphql",
  apiKey: "linear-test-key",
  teamId: "team-1",
};

describe("linear modules", () => {
  test("creates and updates issues", async () => {
    scenario = "success";
    const { createIssue, updateIssue, addComment, getIssue, getIssueLabelIds, addLabel, setEstimate } = await import(
      "../../src/integrations/linear-issues"
    );

    const created = await createIssue({ cfg, title: "Test issue", description: "desc" });
    expect(created.issueId).toBe("issue-1");

    const updated = await updateIssue({ cfg, issueId: "issue-1", title: "Updated" });
    expect(updated.title).toBe("Updated");

    const comment = await addComment({ cfg, issueId: "issue-1", body: "hello" });
    expect(comment.commentId).toBe("comment-1");

    const labels = await getIssueLabelIds({ cfg, issueId: "issue-1" });
    expect(labels).toEqual(["label-1"]);

    const issue = await getIssue({ cfg, issueId: "issue-1" });
    expect(issue.identifier).toBe("ABC-1");

    const merged = await addLabel({ cfg, issueId: "issue-1", labelId: "label-2" });
    expect(merged.labelIds).toEqual(["label-1", "label-2"]);

    const estimate = await setEstimate({ cfg, issueId: "issue-1", estimate: 5 });
    expect(estimate.estimate).toBe(5);
  });

  test("throws when issue create response is missing", async () => {
    scenario = "create-issue-missing";
    const { createIssue } = await import("../../src/integrations/linear-issues");
    await expect(createIssue({ cfg, title: "Fail issue" })).rejects.toThrow("Issue not created");
  });

  test("throws when issue update response is missing", async () => {
    scenario = "update-issue-missing";
    const { updateIssue } = await import("../../src/integrations/linear-issues");
    await expect(updateIssue({ cfg, issueId: "issue-1" })).rejects.toThrow("Issue not updated");
  });

  test("throws when comment response is missing", async () => {
    scenario = "comment-missing";
    const { addComment } = await import("../../src/integrations/linear-issues");
    await expect(addComment({ cfg, issueId: "issue-1", body: "hi" })).rejects.toThrow("Comment not created");
  });

  test("throws when issue response is missing", async () => {
    scenario = "issue-missing";
    const { getIssue } = await import("../../src/integrations/linear-issues");
    await expect(getIssue({ cfg, issueId: "issue-1" })).rejects.toThrow("Issue not found");
  });

  test("throws when syncTaskStatus cannot match a state", async () => {
    scenario = "no-states";
    const { syncTaskStatus } = await import("../../src/integrations/linear-issues");
    await expect(syncTaskStatus({ cfg, issueId: "issue-1", status: "Unknown" })).rejects.toThrow("No matching state");
  });

  test("syncs task status when a matching state is available", async () => {
    scenario = "success";
    const { syncTaskStatus } = await import("../../src/integrations/linear-issues");
    const result = await syncTaskStatus({ cfg, issueId: "issue-1", status: "In Progress" });
    expect(result).toEqual({ issueId: "issue-1", stateId: "state-2" });
  });

  test("loads viewer and team states", async () => {
    scenario = "success";
    const { getViewer, createProject, getProjectStatus } = await import("../../src/integrations/linear-projects");
    const { getTeamStates, normalizeStatus } = await import("../../src/integrations/linear-teams");

    const viewer = await getViewer(cfg);
    expect(viewer.id).toBe("viewer-1");

    const project = await createProject({ cfg, name: "Project" });
    expect(project.projectId).toBe("project-1");

    const status = await getProjectStatus({ cfg, projectId: "project-1" });
    expect(status.project.id).toBe("project-1");

    const states = await getTeamStates({ cfg });
    expect(states.length).toBeGreaterThan(0);
    expect(normalizeStatus("In Progress")).toBe("in_progress");
  });

  test("does not double-prefix project names", async () => {
    scenario = "success";
    const { createProject } = await import("../../src/integrations/linear-projects");
    const prefixed = await createProject({ cfg: { ...cfg, projectPrefix: "OC" }, name: "OC-Launch" });
    expect(prefixed.name).toBe("OC-Launch");
  });

  test("throws when project responses are missing", async () => {
    scenario = "project-missing";
    const { createProject, getProjectStatus } = await import("../../src/integrations/linear-projects");
    await expect(createProject({ cfg, name: "Project" })).rejects.toThrow("Project not created");

    scenario = "project-not-found";
    await expect(getProjectStatus({ cfg, projectId: "project-1" })).rejects.toThrow("Project not found");
  });
});
