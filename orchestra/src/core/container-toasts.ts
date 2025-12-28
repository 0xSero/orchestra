import type { createApi } from "../api";
import type { createCommunication } from "../communication";
import type { OrchestratorConfig, WorkerInstance, WorkerProfile } from "../types";
import type { WorkerJob } from "../workers/jobs";

type ToastVariant = "info" | "success" | "warning" | "error";

interface ToastBody {
  title: string;
  message: string;
  variant: ToastVariant;
}

const formatJobToast = (job: WorkerJob, status: "created" | "succeeded" | "failed") => {
  const label = status === "created" ? "Job Queued" : status === "succeeded" ? "Job Complete" : "Job Failed";
  const type: ToastVariant = status === "failed" ? "error" : status === "succeeded" ? "success" : "info";
  return { title: `${label}: ${job.workerId}`, message: `Job ${job.id}`, variant: type } satisfies ToastBody;
};

/** Wire up toast notifications for orchestrator lifecycle events. */
export const registerCommunicationToasts = (input: {
  api: ReturnType<typeof createApi>;
  communication: ReturnType<typeof createCommunication>;
  profiles: Record<string, WorkerProfile>;
  config: OrchestratorConfig;
}) => {
  const { api, communication, profiles, config } = input;
  const toastsEnabled = config.ui?.toasts !== false;

  const showToast = (body: ToastBody) => {
    if (!toastsEnabled) return;
    api.tui.showToast({ body }).catch((err) => console.log("[Toast] Failed:", err));
  };

  const profileCount = Object.keys(profiles).length;
  const autoSpawn = config.spawn ?? [];

  showToast({
    title: "Orchestra Plugin Ready",
    message: `${profileCount} worker profiles loaded${autoSpawn.length > 0 ? `, auto-spawning: ${autoSpawn.join(", ")}` : ""}`,
    variant: "success",
  });

  communication.emit(
    "orchestra.started",
    { profileCount, autoSpawn, fallbackModel: undefined },
    { source: "orchestrator" },
  );

  communication.on("orchestra.model.resolved", (event) => {
    const { resolution } = event.data;
    showToast({
      title: `Model Resolved: ${resolution.profileId}`,
      message: `${resolution.from} → ${resolution.to}`,
      variant: "info",
    });
  });

  communication.on("orchestra.model.fallback", (event) => {
    const { profileId, model, reason } = event.data;
    showToast({
      title: `Model Fallback: ${profileId}`,
      message: `Using ${model} (${reason})`,
      variant: "warning",
    });
  });

  communication.on("orchestra.worker.spawned", (event: { data: { worker: WorkerInstance } }) => {
    const { worker } = event.data;
    showToast({
      title: `Spawning: ${worker.profile.name}`,
      message: `Model: ${worker.profile.model}`,
      variant: "info",
    });
  });

  communication.on("orchestra.worker.reused", (event: { data: { worker: WorkerInstance } }) => {
    const { worker } = event.data;
    showToast({
      title: `Reusing: ${worker.profile.name}`,
      message: `Port ${worker.port}`,
      variant: "info",
    });
  });

  communication.on("orchestra.worker.ready", (event: { data: { worker: WorkerInstance } }) => {
    const { worker } = event.data;
    showToast({
      title: `Ready: ${worker.profile.name}`,
      message: `Port ${worker.port}`,
      variant: "success",
    });
  });

  communication.on("orchestra.worker.error", (event: { data: { worker: WorkerInstance; error: unknown } }) => {
    const { worker, error } = event.data;
    showToast({
      title: `Worker Error: ${worker.profile.name}`,
      message: typeof error === "string" ? error : "Worker encountered an error",
      variant: "error",
    });
  });

  communication.on("orchestra.worker.stopped", (event: { data: { worker: WorkerInstance } }) => {
    const { worker } = event.data;
    showToast({
      title: `Stopped: ${worker.profile.name}`,
      message: `Port ${worker.port}`,
      variant: "warning",
    });
  });

  communication.on(
    "orchestra.worker.wakeup",
    (event: { data: { workerId: string; reason: string; summary?: string } }) => {
      const { workerId, reason, summary } = event.data;
      showToast({
        title: `Worker Wakeup: ${workerId}`,
        message: summary ? `${reason}: ${summary}` : reason,
        variant: "info",
      });
    },
  );

  communication.on(
    "orchestra.worker.job",
    (event: { data: { job: WorkerJob; status: "created" | "succeeded" | "failed" } }) => {
      showToast(formatJobToast(event.data.job, event.data.status));
    },
  );

  communication.on("orchestra.subagent.active", (event) => {
    const subagent = event.data.subagent;
    showToast({
      title: `Subagent Active: ${subagent.workerId}`,
      message: subagent.profile?.name ?? "Switching to worker session",
      variant: "info",
    });
  });

  communication.on("orchestra.subagent.closed", (event) => {
    const subagent = event.data.subagent;
    const error = event.data.result?.error;
    showToast({
      title: `Subagent Closed: ${subagent.workerId}`,
      message: error ?? "Returning to parent session",
      variant: error ? "error" : "success",
    });
  });

  communication.on("orchestra.vision.started", () => {
    showToast({
      title: "Analyzing Image",
      message: "Vision worker is processing your image...",
      variant: "info",
    });
  });

  communication.on(
    "orchestra.vision.completed",
    (event: { data: { success: boolean; error?: string; durationMs?: number } }) => {
      const { success, error, durationMs } = event.data;
      if (success) {
        const duration = durationMs ? ` (${(durationMs / 1000).toFixed(1)}s)` : "";
        showToast({
          title: "Image Analyzed",
          message: `Vision analysis complete${duration}`,
          variant: "success",
        });
      } else {
        showToast({
          title: "Vision Failed",
          message: error ?? "Could not analyze image",
          variant: "error",
        });
      }
    },
  );
};
