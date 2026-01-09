/**
 * Task Args Builder Tests - Safe argument construction for task_start commands
 */

import { describe, expect, test } from "vitest";
import {
  buildTaskStartArgs,
  buildTaskAwaitArgs,
  buildTaskPeekArgs,
  buildTaskCancelArgs,
  escapeArgValue,
  type TaskKind,
} from "../task-args";

describe("escapeArgValue", () => {
  test("escapes double quotes", () => {
    expect(escapeArgValue('say "hello"')).toBe('say \\"hello\\"');
  });

  test("escapes backslashes before quotes", () => {
    expect(escapeArgValue('path\\to\\"file"')).toBe('path\\\\to\\\\\\"file\\"');
  });

  test("preserves normal strings", () => {
    expect(escapeArgValue("simple task")).toBe("simple task");
  });

  test("handles empty string", () => {
    expect(escapeArgValue("")).toBe("");
  });

  test("handles newlines by replacing with space", () => {
    expect(escapeArgValue("line1\nline2")).toBe("line1 line2");
  });
});

describe("buildTaskStartArgs", () => {
  describe("kind=auto", () => {
    test("builds auto task with required fields", () => {
      const args = buildTaskStartArgs({
        kind: "auto",
        task: "Fix the bug",
      });
      expect(args).toBe('--kind auto --task "Fix the bug"');
    });

    test("escapes quotes in task", () => {
      const args = buildTaskStartArgs({
        kind: "auto",
        task: 'Create a "hello world" function',
      });
      expect(args).toBe('--kind auto --task "Create a \\"hello world\\" function"');
    });
  });

  describe("kind=worker", () => {
    test("builds worker task with workerId", () => {
      const args = buildTaskStartArgs({
        kind: "worker",
        task: "Analyze this code",
        workerId: "coder",
      });
      expect(args).toBe('--kind worker --workerId coder --task "Analyze this code"');
    });

    test("includes model override when specified", () => {
      const args = buildTaskStartArgs({
        kind: "worker",
        task: "Quick analysis",
        workerId: "coder",
        model: "anthropic/claude-3-haiku-20240307",
      });
      expect(args).toBe(
        '--kind worker --workerId coder --model "anthropic/claude-3-haiku-20240307" --task "Quick analysis"',
      );
    });

    test("includes modelPolicy when specified", () => {
      const args = buildTaskStartArgs({
        kind: "worker",
        task: "Deep analysis",
        workerId: "coder",
        model: "anthropic/claude-sonnet-4-20250514",
        modelPolicy: "sticky",
      });
      expect(args).toContain("--modelPolicy sticky");
    });

    test("includes autoSpawn when false", () => {
      const args = buildTaskStartArgs({
        kind: "worker",
        task: "Quick task",
        workerId: "coder",
        autoSpawn: false,
      });
      expect(args).toContain("--autoSpawn false");
    });

    test("omits autoSpawn when true (default)", () => {
      const args = buildTaskStartArgs({
        kind: "worker",
        task: "Quick task",
        workerId: "coder",
        autoSpawn: true,
      });
      expect(args).not.toContain("autoSpawn");
    });

    test("includes timeoutMs when specified", () => {
      const args = buildTaskStartArgs({
        kind: "worker",
        task: "Long task",
        workerId: "coder",
        timeoutMs: 1200000,
      });
      expect(args).toContain("--timeoutMs 1200000");
    });
  });

  describe("kind=workflow", () => {
    test("builds workflow task with workflowId", () => {
      const args = buildTaskStartArgs({
        kind: "workflow",
        task: "Run the deployment workflow",
        workflowId: "deploy-pipeline",
      });
      expect(args).toBe('--kind workflow --workflowId deploy-pipeline --task "Run the deployment workflow"');
    });

    test("includes continueRunId when specified", () => {
      const args = buildTaskStartArgs({
        kind: "workflow",
        task: "Continue paused workflow",
        continueRunId: "run-abc123",
      });
      expect(args).toBe('--kind workflow --continueRunId run-abc123 --task "Continue paused workflow"');
    });
  });

  describe("kind=op", () => {
    test("builds memory.put op", () => {
      const args = buildTaskStartArgs({
        kind: "op",
        task: "Store decision",
        op: "memory.put",
        memory: {
          key: "architecture/decision-001",
          value: "Use microservices architecture",
          scope: "project",
          tags: ["architecture", "decision"],
        },
      });
      expect(args).toContain("--kind op");
      expect(args).toContain("--op memory.put");
      expect(args).toContain('"key":"architecture/decision-001"');
      expect(args).toContain('"value":"Use microservices architecture"');
    });

    test("builds memory.link op", () => {
      const args = buildTaskStartArgs({
        kind: "op",
        task: "Link decisions",
        op: "memory.link",
        memory: {
          fromKey: "architecture/decision-001",
          toKey: "architecture/decision-002",
          relation: "depends_on",
        },
      });
      expect(args).toContain("--op memory.link");
      expect(args).toContain('"fromKey":"architecture/decision-001"');
      expect(args).toContain('"relation":"depends_on"');
    });

    test("builds memory.done op", () => {
      const args = buildTaskStartArgs({
        kind: "op",
        task: "Complete memory task",
        op: "memory.done",
        memory: {
          taskId: "task-xyz",
          summary: "Completed architecture review",
        },
      });
      expect(args).toContain("--op memory.done");
      expect(args).toContain('"taskId":"task-xyz"');
    });

    test("builds worker.model.set op", () => {
      const args = buildTaskStartArgs({
        kind: "op",
        task: "Set worker model",
        op: "worker.model.set",
        worker: {
          workerId: "coder",
          model: "anthropic/claude-sonnet-4-20250514",
          modelPolicy: "sticky",
        },
      });
      expect(args).toContain("--op worker.model.set");
      expect(args).toContain('"workerId":"coder"');
      expect(args).toContain('"model":"anthropic/claude-sonnet-4-20250514"');
    });

    test("builds worker.model.reset op", () => {
      const args = buildTaskStartArgs({
        kind: "op",
        task: "Reset worker model",
        op: "worker.model.reset",
        worker: {
          workerId: "coder",
          respawn: true,
        },
      });
      expect(args).toContain("--op worker.model.reset");
      expect(args).toContain('"respawn":true');
    });
  });
});

describe("buildTaskAwaitArgs", () => {
  test("builds args for single taskId", () => {
    const args = buildTaskAwaitArgs({ taskId: "task-123" });
    expect(args).toBe("--taskId task-123");
  });

  test("builds args for multiple taskIds", () => {
    const args = buildTaskAwaitArgs({ taskIds: ["task-1", "task-2", "task-3"] });
    expect(args).toBe("--taskIds task-1 --taskIds task-2 --taskIds task-3");
  });

  test("includes timeoutMs when specified", () => {
    const args = buildTaskAwaitArgs({ taskId: "task-123", timeoutMs: 30000 });
    expect(args).toBe("--taskId task-123 --timeoutMs 30000");
  });
});

describe("buildTaskPeekArgs", () => {
  test("builds args for single taskId", () => {
    const args = buildTaskPeekArgs({ taskId: "task-456" });
    expect(args).toBe("--taskId task-456");
  });

  test("builds args for multiple taskIds", () => {
    const args = buildTaskPeekArgs({ taskIds: ["task-a", "task-b"] });
    expect(args).toBe("--taskIds task-a --taskIds task-b");
  });
});

describe("buildTaskCancelArgs", () => {
  test("builds args for single taskId", () => {
    const args = buildTaskCancelArgs({ taskId: "task-789" });
    expect(args).toBe("--taskId task-789");
  });

  test("builds args for multiple taskIds", () => {
    const args = buildTaskCancelArgs({ taskIds: ["task-x", "task-y"] });
    expect(args).toBe("--taskIds task-x --taskIds task-y");
  });

  test("includes reason when specified", () => {
    const args = buildTaskCancelArgs({ taskId: "task-789", reason: "User requested cancellation" });
    expect(args).toBe('--taskId task-789 --reason "User requested cancellation"');
  });
});

describe("TaskKind type safety", () => {
  test("validates task kinds", () => {
    const kinds: TaskKind[] = ["auto", "worker", "workflow", "op"];
    expect(kinds).toHaveLength(4);
  });
});
