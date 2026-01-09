import { describe, expect, test } from "bun:test";
import {
  WORKTREE_SANDBOX_WORKFLOW_ID,
  buildWorktreeSandboxWorkflow,
} from "../../../src/workflows/builtins/worktrees";

describe("worktree-sandbox workflow", () => {
  test("builds a workflow with a single coder step", () => {
    const workflow = buildWorktreeSandboxWorkflow();
    expect(workflow.id).toBe(WORKTREE_SANDBOX_WORKFLOW_ID);
    expect(workflow.steps.length).toBe(1);
    expect(workflow.steps[0]?.workerId).toBe("coder");
    expect(workflow.steps[0]?.prompt).toContain("worktree_mode");
    expect(workflow.steps[0]?.prompt).toContain("worktree_make");
  });
});
