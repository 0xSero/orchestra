# Examples

## 1) Screenshot Bug Debugging

Use the vision worker to analyze a screenshot, then hand off to a coder.

```
delegate_task({
  task: "Analyze the UI screenshot and propose a fix.",
  attachments: [{ type: "image", path: "/path/to/screenshot.png" }]
})
```

## 2) Spec to Implementation

Run the built-in workflow for multi-step planning:

```
run_workflow({
  workflowId: "spec-to-implementation",
  task: "Add CSV export to the reports page."
})
```

## 3) Memory Records

Record a decision and query recent memory (injection happens automatically when enabled):

```
/memory.record decision:csv-export Use server-side streaming for large exports --tags decisions
/memory.query csv export --limit 5
```

## More

See `docs/runbooks/` and the OpenCode docs for additional patterns.
