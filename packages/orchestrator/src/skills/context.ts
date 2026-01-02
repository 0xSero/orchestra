export type WorkflowSkillContext = {
  runId: string;
  stepId: string;
  workflowId?: string;
  workerId: string;
};

const sessionContext = new Map<string, WorkflowSkillContext>();
const workerContext = new Map<string, WorkflowSkillContext>();

export function setWorkflowSkillContext(input: {
  workerId: string;
  sessionId?: string;
  runId: string;
  stepId: string;
  workflowId?: string;
}): void {
  const context: WorkflowSkillContext = {
    runId: input.runId,
    stepId: input.stepId,
    workflowId: input.workflowId,
    workerId: input.workerId,
  };
  workerContext.set(input.workerId, context);
  if (input.sessionId) {
    sessionContext.set(input.sessionId, context);
  }
}

export function clearWorkflowSkillContext(input: {
  workerId?: string;
  sessionId?: string;
}): void {
  if (input.workerId) workerContext.delete(input.workerId);
  if (input.sessionId) sessionContext.delete(input.sessionId);
}

export function getWorkflowContextForSession(
  sessionId: string,
): WorkflowSkillContext | undefined {
  return sessionContext.get(sessionId);
}

export function getWorkflowContextForWorker(
  workerId: string,
): WorkflowSkillContext | undefined {
  return workerContext.get(workerId);
}
