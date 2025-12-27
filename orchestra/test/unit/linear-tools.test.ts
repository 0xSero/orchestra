import { describe, expect, test, mock } from "bun:test";

describe("linear tools", () => {
  test("executes linear tools and serializes responses", async () => {
    let shouldThrow = false;

    mock.module("../../src/integrations/linear", () => ({
      resolveLinearConfig: () => {
        if (shouldThrow) throw new Error("missing config");
        return { teamId: "team-1", apiUrl: "https://linear.test", apiKey: "key" };
      },
      createIssue: async () => ({ id: "issue-1", identifier: "ABC-1", title: "Issue", url: "url" }),
      updateIssue: async () => ({ id: "issue-1", identifier: "ABC-1", title: "Updated" }),
      addComment: async () => ({ id: "comment-1" }),
      addLabel: async () => ({ id: "issue-1", identifier: "ABC-1" }),
      setEstimate: async () => ({ id: "issue-1", identifier: "ABC-1", estimate: 5 }),
      syncTaskStatus: async () => ({ id: "issue-1", identifier: "ABC-1", status: "done" }),
      getIssue: async () => ({ id: "issue-1", identifier: "ABC-1", title: "Issue" }),
    }));

    const { createLinearTools } = await import("../../src/tools/linear-tools");

    try {
      const tools = createLinearTools({ config: { apiKey: "key", teamId: "team-1" } });

      const created = JSON.parse(await tools.orchestrator.linear_create_issue.execute({ title: "Test" }));
      expect(created.id).toBe("issue-1");

      const updated = JSON.parse(await tools.orchestrator.linear_update_issue.execute({ issueId: "issue-1" }));
      expect(updated.title).toBe("Updated");

      const comment = JSON.parse(await tools.orchestrator.linear_add_comment.execute({ issueId: "issue-1", body: "hi" }));
      expect(comment.id).toBe("comment-1");

      const labeled = JSON.parse(await tools.orchestrator.linear_add_label.execute({ issueId: "issue-1", labelId: "label-1" }));
      expect(labeled.identifier).toBe("ABC-1");

      const estimate = JSON.parse(await tools.orchestrator.linear_set_estimate.execute({ issueId: "issue-1", estimate: 3 }));
      expect(estimate.estimate).toBe(3);

      const synced = JSON.parse(await tools.orchestrator.linear_sync_status.execute({ issueId: "issue-1", status: "done" }));
      expect(synced.status).toBe("done");

      const issue = JSON.parse(await tools.workers.linear_get_issue.execute({ issueId: "issue-1" }));
      expect(issue.id).toBe("issue-1");

      const config = JSON.parse(await tools.workers.linear_get_config.execute({}));
      expect(config.configured).toBe(true);

      shouldThrow = true;
      const failureTools = createLinearTools({ config: { apiKey: "key", teamId: "team-1" } });
      const failedConfig = JSON.parse(await failureTools.workers.linear_get_config.execute({}));
      expect(failedConfig.configured).toBe(false);
    } finally {
      mock.restore();
    }
  });
});
