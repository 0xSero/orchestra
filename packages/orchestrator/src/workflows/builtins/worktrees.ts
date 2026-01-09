import type { WorkflowDefinition } from "../types";

export const WORKTREE_SANDBOX_WORKFLOW_ID = "worktree-sandbox";

const defaultPrompt = [
  "You are setting up a git worktree sandbox for 24/7 autonomous operation.",
  "",
  "Task:",
  "{task}",
  "",
  "Requirements:",
  "- Use the OpenCode Open Trees plugin (`open-trees`).",
  '- Enable worktree mode: `worktree_mode { "action": "on" }`.',
  '- Create the worktree + session: `worktree_make { "action": "start", "name": "<name>", "openSessions": true }`.',
  "- Pick a short, safe <name> (kebab-case). If the task includes a name, use it; otherwise default to `orchestra-sandbox`.",
  "- If the `worktree_*` tools are unavailable, tell the user to install/enable `open-trees` and stop.",
  "- Confirm the worktree path + branch and the new session ID returned by `worktree_make`.",
  "- Ensure `.opencode/orchestrator.local.json` exists in the worktree; if missing, tell the user to create it to enable 24/7 triggers.",
  "- Reply with the exact next steps (open sessions UI, select the new session, verify directory + config).",
].join("\n");

export function buildWorktreeSandboxWorkflow(): WorkflowDefinition {
  return {
    id: WORKTREE_SANDBOX_WORKFLOW_ID,
    name: "Worktree Sandbox Setup",
    description:
      "Create a sandbox git worktree and local orchestrator overrides for isolated 24/7 operation.",
    steps: [
      {
        id: "setup",
        title: "Create worktree sandbox",
        workerId: "coder",
        prompt: defaultPrompt,
        carry: false,
      },
    ],
  };
}
