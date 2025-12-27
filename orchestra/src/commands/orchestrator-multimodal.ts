import { existsSync } from "node:fs";
import { resolve as resolvePath } from "node:path";
import type { WorkerInstance, WorkerProfile } from "../types";
import { DEMO_WORKER_ID, MULTIMODAL_TIMEBOX } from "./orchestrator-constants";
import { buildFallbackImage, type ImageAttachment } from "./orchestrator-image";
import { truncateText } from "./orchestrator-utils";

/** Run the multimodal demo (vision analysis + workflow run) for onboarding. */
export const runMultimodalDemo = async (input: {
  deps: {
    workers: {
      listProfiles: () => WorkerProfile[];
      send: (
        workerId: string,
        message: string,
        options?: {
          timeout?: number;
          from?: string;
          attachments?: Array<{ type: "image"; base64?: string; path?: string; mimeType?: string }>;
        },
      ) => Promise<{ success: boolean; response?: string; error?: string }>;
    };
    orchestrator: {
      ensureWorker: (input: { workerId: string; reason: "manual" }) => Promise<WorkerInstance>;
      runWorkflow: (input: { workflowId: string; task: string }) => Promise<{
        workflowId: string;
        workflowName: string;
        steps: Array<{
          id: string;
          title: string;
          workerId: string;
          status: string;
          response?: string;
          error?: string;
        }>;
      }>;
    };
  };
  imagePath?: string;
  base64?: string;
  mimeType?: string;
  workflowId: string;
  workflowTask: string;
  timeoutMs: number;
}) => {
  const profiles = input.deps.workers.listProfiles();
  const byId = new Map(profiles.map((profile) => [profile.id, profile]));
  const visionProfile =
    byId.get(DEMO_WORKER_ID) ?? profiles.find((profile) => profile.supportsVision) ?? byId.get("vision");

  if (!visionProfile) {
    return "No vision-capable worker is available. Add a vision profile to run the multimodal demo.";
  }

  const attachment: ImageAttachment | { type: "image"; path: string; mimeType?: string } =
    input.imagePath && existsSync(input.imagePath)
      ? { type: "image" as const, path: resolvePath(input.imagePath), mimeType: input.mimeType }
      : input.base64
        ? { type: "image" as const, base64: input.base64, mimeType: input.mimeType ?? "image/png" }
        : buildFallbackImage();

  await input.deps.orchestrator.ensureWorker({ workerId: visionProfile.id, reason: "manual" });
  const visionPrompt = [
    `Multimodal Demo (${MULTIMODAL_TIMEBOX} timebox)`,
    "Describe the image, call out any text, and give one actionable insight.",
  ].join("\n");
  const visionRes = await input.deps.workers.send(visionProfile.id, visionPrompt, {
    timeout: input.timeoutMs,
    from: "onboarding",
    attachments: [attachment],
  });

  let workflowOutput = "Workflow demo unavailable.";
  try {
    const workflowResult = await input.deps.orchestrator.runWorkflow({
      workflowId: input.workflowId,
      task: input.workflowTask,
    });
    const stepLines = workflowResult.steps.map((step) => {
      if (step.status === "error") {
        return `- ${step.title} (${step.workerId}): error (${step.error ?? "unknown"})`;
      }
      return `- ${step.title} (${step.workerId}): ${truncateText(step.response ?? "")}`;
    });
    workflowOutput = [`Workflow: ${workflowResult.workflowName} (${workflowResult.workflowId})`, ...stepLines].join(
      "\n",
    );
  } catch (err) {
    workflowOutput = `Workflow demo failed: ${err instanceof Error ? err.message : String(err)}`;
  }

  const visionOutput = visionRes.success
    ? truncateText(visionRes.response ?? "No vision response returned.")
    : `Vision demo failed: ${visionRes.error ?? "unknown error"}`;

  const modelLabel = visionProfile.model ? ` (model: ${visionProfile.model})` : "";

  return [`Vision Output${modelLabel}`, visionOutput, "", workflowOutput].join("\n");
};
