**Rules**

Execution Format
- All planning artifacts and task files are written in Markdown with a single consistent schema.
- Task files must be named tasks/task-XX.md where XX is a two-digit, zero-padded index.

Task Execution Order
- Tasks are numbered and executed in ascending order: task-00.md, task-01.md, ..., task-NN.md.
- Each task must be self-contained with Goal, Before, After, Acceptance criteria, Files to touch, Test plan.

Planning and Validation
- The full queue is generated upfront and should be consistent with the current codebase snapshot.
- After creating or updating tasks, revalidate that there are no stale or orphaned tasks outside the queue.

Quality and Testing
- Ensure scope.md and rules.md reflect the actual fixture structure before creating task files.
- Ensure each task has a clear Acceptance criteria and a Test plan to verify completion.

Versioning and Defaults
- Do not modify unrelated files outside the fixture unless explicitly required by a task.
- Changes should be minimal and focused on the defined goal of the task.
