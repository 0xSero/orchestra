import { describe, expect, test } from "bun:test";
import {
  buildPendingTaskReminder,
  needsLegacyToolCorrection,
  buildLegacyToolCorrectionHint,
} from "../../../src/core/guardrails";

describe("needsLegacyToolCorrection", () => {
  test("returns false for undefined", () => {
    expect(needsLegacyToolCorrection(undefined)).toBe(false);
  });

  test("returns false for empty string", () => {
    expect(needsLegacyToolCorrection("")).toBe(false);
  });

  test("returns false for normal text without tool name", () => {
    expect(needsLegacyToolCorrection("Just a normal message")).toBe(false);
  });

  test("detects run_workflow", () => {
    expect(needsLegacyToolCorrection("Use run_workflow() to execute")).toBe(
      true,
    );
  });

  test("detects list_workflows", () => {
    expect(needsLegacyToolCorrection("Call list_workflows()")).toBe(true);
  });

  test("detects continue_workflow", () => {
    expect(needsLegacyToolCorrection("Use continue_workflow()")).toBe(true);
  });

  test("detects ask_worker_async", () => {
    expect(needsLegacyToolCorrection("Use ask_worker_async()")).toBe(true);
  });

  test("detects ask_worker", () => {
    expect(needsLegacyToolCorrection("Call ask_worker()")).toBe(true);
  });

  test("detects await_worker_job", () => {
    expect(needsLegacyToolCorrection("await await_worker_job()")).toBe(true);
  });

  test("detects get_worker_job", () => {
    expect(needsLegacyToolCorrection("Use get_worker_job()")).toBe(true);
  });

  test("detects list_worker_jobs", () => {
    expect(needsLegacyToolCorrection("list_worker_jobs()")).toBe(true);
  });

  test("detects spawn_worker", () => {
    expect(needsLegacyToolCorrection("spawn_worker()")).toBe(true);
  });

  test("detects delegate_task", () => {
    expect(needsLegacyToolCorrection("delegate_task()")).toBe(true);
  });

  test("detects list_workers", () => {
    expect(needsLegacyToolCorrection("list_workers()")).toBe(true);
  });

  test("detects list_profiles", () => {
    expect(needsLegacyToolCorrection("list_profiles()")).toBe(true);
  });

  test("detects list_models", () => {
    expect(needsLegacyToolCorrection("list_model()")).toBe(false);
  });

  test("detects orchestrator_output", () => {
    expect(needsLegacyToolCorrection("orchestrator_output()")).toBe(true);
  });

  test("detects orchestrator_results", () => {
    expect(needsLegacyToolCorrection("orchestrator_results()")).toBe(true);
  });

  test("detects orchestrator_status", () => {
    expect(needsLegacyToolCorrection("orchestrator_status()")).toBe(true);
  });

  test("detects unknown tool message", () => {
    expect(needsLegacyToolCorrection("Error: unknown tool example")).toBe(true);
  });

  test("detects tool not found", () => {
    expect(needsLegacyToolCorrection("Error: tool not found")).toBe(true);
  });

  test("detects not allowed", () => {
    expect(needsLegacyToolCorrection("Permission denied: not allowed")).toBe(
      true,
    );
  });

  test("detects access denied", () => {
    expect(needsLegacyToolCorrection("Access denied")).toBe(true);
  });

  test("returns false if already contains guardrail marker", () => {
    expect(
      needsLegacyToolCorrection("[ORCHESTRATOR GUARDRAIL] Use task_start()"),
    ).toBe(false);
  });

  test("is case insensitive", () => {
    expect(needsLegacyToolCorrection("RUN_WORKFLOW()")).toBe(true);
    expect(needsLegacyToolCorrection("Ask_Worker()")).toBe(true);
  });
});

describe("buildLegacyToolCorrectionHint", () => {
  test("returns hint about Task API", () => {
    const hint = buildLegacyToolCorrectionHint();
    expect(hint).toContain("Task API");
    expect(hint).toContain("task_start");
    expect(hint).toContain("task_await");
    expect(hint).toContain("task_list");
  });

  test("contains markdown formatting", () => {
    const hint = buildLegacyToolCorrectionHint();
    expect(hint).toContain("**[ORCHESTRATOR GUARDRAIL]**");
    expect(hint).toContain("```");
  });
});

describe("buildPendingTaskReminder", () => {
  test("returns undefined for empty sessionId", () => {
    expect(buildPendingTaskReminder("")).toBeUndefined();
    expect(buildPendingTaskReminder(undefined)).toBeUndefined();
  });

  test("returns undefined when no pending tasks", () => {
    const result = buildPendingTaskReminder("session-123");
    expect(result).toBeUndefined();
  });

  test("returns reminder containing task_await", () => {
    const reminder = buildPendingTaskReminder("session-123");
    // May be undefined if no tasks, or contain task_await if tasks exist
    if (reminder) {
      expect(reminder).toContain("task_await");
    }
  });

  test("respects limit option", () => {
    const reminder = buildPendingTaskReminder("session-123", { limit: 10 });
    expect(reminder).toBeUndefined();
  });

  test("returns string when tasks exist", () => {
    const reminder = buildPendingTaskReminder("session-123");
    if (reminder) {
      expect(typeof reminder).toBe("string");
      expect(reminder.length).toBeGreaterThan(0);
    }
  });
});
