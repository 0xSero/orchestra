import { describe, expect, test } from "bun:test";
import { createLinearTools } from "../../src/tools/linear-tools";

describe("linear tools", () => {
  test("executes linear tools and serializes responses", async () => {
    let shouldThrow = false;

    const api = {
      resolveConfig: () => {
        if (shouldThrow) throw new Error("missing config");
        return { teamId: "team-1", apiUrl: "https://linear.test", apiKey: "key" };
      },
      createIssue: async () => ({ issueId: "issue-1", identifier: "ABC-1", url: "url" }),
      updateIssue: async () => ({ issueId: "issue-1", title: "Updated" }),
      addComment: async () => ({ commentId: "comment-1" }),
      addLabel: async () => ({ issueId: "issue-1", labelIds: ["label-1"] }),
      setEstimate: async () => ({ issueId: "issue-1", estimate: 3 }),
      syncTaskStatus: async () => ({ issueId: "issue-1", stateId: "state-1" }),
      getIssue: async () => ({ id: "issue-1", identifier: "ABC-1", title: "Issue" }),
    };

    const tools = createLinearTools({ config: { apiKey: "key", teamId: "team-1" }, api });

    const ctx = {
      sessionID: "session-1",
      messageID: "msg-1",
      agent: "orchestrator",
      abort: new AbortController().signal,
    };

    const created = JSON.parse(await tools.orchestrator.linear_create_issue.execute({ title: "Test" }, ctx));
    expect(created.id).toBe("issue-1");

    const updated = JSON.parse(await tools.orchestrator.linear_update_issue.execute({ issueId: "issue-1" }, ctx));
    expect(updated.title).toBe("Updated");

    const comment = JSON.parse(
      await tools.orchestrator.linear_add_comment.execute({ issueId: "issue-1", body: "hi" }, ctx),
    );
    expect(comment.id).toBe("comment-1");

    const labeled = JSON.parse(
      await tools.orchestrator.linear_add_label.execute({ issueId: "issue-1", labelId: "label-1" }, ctx),
    );
    expect(labeled.labelIds).toEqual(["label-1"]);

    const estimate = JSON.parse(
      await tools.orchestrator.linear_set_estimate.execute({ issueId: "issue-1", estimate: 3 }, ctx),
    );
    expect(estimate.estimate).toBe(3);

    const synced = JSON.parse(
      await tools.orchestrator.linear_sync_status.execute({ issueId: "issue-1", status: "done" }, ctx),
    );
    expect(synced.status).toBe("done");

    const issue = JSON.parse(await tools.workers.linear_get_issue.execute({ issueId: "issue-1" }, ctx));
    expect(issue.id).toBe("issue-1");

    const config = JSON.parse(await tools.workers.linear_get_config.execute({}, ctx));
    expect(config.configured).toBe(true);

    shouldThrow = true;
    const failureTools = createLinearTools({ config: { apiKey: "key", teamId: "team-1" }, api });
    const failedConfig = JSON.parse(await failureTools.workers.linear_get_config.execute({}, ctx));
    expect(failedConfig.configured).toBe(false);
  });
});
