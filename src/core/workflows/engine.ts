import type { WorkflowDefinition, WorkflowId, WorkflowRunInput, WorkflowRunResult, WorkflowRunSecurity } from "./types";

export class WorkflowEngine {
  private workflows: Map<WorkflowId, WorkflowDefinition> = new Map();

  register(workflow: WorkflowDefinition): void {
    this.workflows.set(workflow.id, workflow);
  }

  list(): Array<{ id: string; title: string; description: string }> {
    return [...this.workflows.values()].map((w) => ({ id: w.id, title: w.title, description: w.description }));
  }

  get(id: WorkflowId): WorkflowDefinition | undefined {
    return this.workflows.get(id);
  }

  async run<TOutput = unknown>(input: {
    workflowId: WorkflowId;
    ctx: Parameters<WorkflowDefinition["run"]>[0];
    payload: WorkflowRunInput;
    security?: WorkflowRunSecurity;
  }): Promise<WorkflowRunResult<TOutput>> {
    const wf = this.workflows.get(input.workflowId);
    if (!wf) {
      const now = new Date().toISOString();
      return {
        workflowId: input.workflowId,
        ok: false,
        error: `Unknown workflow "${input.workflowId}".`,
        steps: [],
        metrics: { totalDurationMs: 0, totalRequestChars: 0, totalResponseChars: 0, startedAt: now, finishedAt: now },
      };
    }
    return (await wf.run(input.ctx as any, input.payload as any, { security: input.security })) as any;
  }
}

