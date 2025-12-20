import type { WorkflowEngine } from "./engine";

let _workflowEngine: WorkflowEngine | undefined;

export function setWorkflowEngine(engine: WorkflowEngine): void {
  _workflowEngine = engine;
}

export function getWorkflowEngine(): WorkflowEngine {
  if (!_workflowEngine) {
    throw new Error("Workflow engine not initialized. This is a bug: plugin init must call setWorkflowEngine().");
  }
  return _workflowEngine;
}

