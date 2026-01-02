import { onOrchestratorEvent } from "../core/orchestrator-events";

export type ToastVariant = "success" | "info" | "warning" | "error";
export type ToastFn = (message: string, variant: ToastVariant) => Promise<void>;

export function startEventPublisher(showToast: ToastFn): () => void {
  const memoryTasks = new Set<string>();

  return onOrchestratorEvent((event) => {
    if (event.type === "orchestra.workflow.started") {
      const data = event.data as Record<string, unknown>;
      const workflowId =
        typeof data.workflowId === "string" ? data.workflowId : "workflow";
      const name =
        typeof data.workflowName === "string" ? data.workflowName : workflowId;
      void showToast(`Workflow "${name}" started`, "info");
      return;
    }

    if (event.type === "orchestra.workflow.completed") {
      const data = event.data as Record<string, unknown>;
      const workflowId =
        typeof data.workflowId === "string" ? data.workflowId : "workflow";
      const name =
        typeof data.workflowName === "string" ? data.workflowName : workflowId;
      const status = data.status === "error" ? "error" : "success";
      const variant: ToastVariant = status === "error" ? "warning" : "success";
      const msg =
        status === "error"
          ? `Workflow "${name}" completed with errors`
          : `Workflow "${name}" completed`;
      void showToast(msg, variant);
      return;
    }

    if (event.type === "orchestra.memory.written") {
      const data = event.data as Record<string, unknown>;
      if (data.action !== "put") return;
      const taskId = typeof data.taskId === "string" ? data.taskId : undefined;
      if (taskId) {
        if (memoryTasks.has(taskId)) return;
        memoryTasks.add(taskId);
      }
      const key = typeof data.key === "string" ? data.key : "memory";
      void showToast(`Memory saved: ${key}`, "success");
      return;
    }

    if (event.type === "orchestra.error") {
      const data = event.data as Record<string, unknown>;
      const message =
        typeof data.message === "string" ? data.message : "Orchestrator error";
      void showToast(message, "error");
    }
  });
}
