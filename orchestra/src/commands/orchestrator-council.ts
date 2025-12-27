import type { WorkerInstance, WorkerProfile } from "../types";
import { COUNCIL_TIMEBOX } from "./orchestrator-constants";
import { pickCouncilWorkers, pickSummaryWorkerId, truncateText } from "./orchestrator-utils";

type CouncilResponse = {
  workerId: string;
  response?: string;
  error?: string;
};

const formatCouncilResponses = (responses: CouncilResponse[]): string =>
  responses
    .map((result) => {
      if (result.error) {
        return `- ${result.workerId}: error (${result.error})`;
      }
      return `- ${result.workerId}: ${truncateText(result.response ?? "No response")}`;
    })
    .join("\n");

/** Run a short parallel "workers council" demo and summarize the results. */
export const runWorkersCouncil = async (input: {
  deps: {
    workers: {
      listProfiles: () => WorkerProfile[];
      send: (
        workerId: string,
        message: string,
        options?: { timeout?: number; from?: string },
      ) => Promise<{ success: boolean; response?: string; error?: string }>;
    };
    orchestrator: { ensureWorker: (input: { workerId: string; reason: "manual" }) => Promise<WorkerInstance> };
  };
  topic: string;
  timeoutMs: number;
}) => {
  const profiles = input.deps.workers.listProfiles();
  if (profiles.length === 0) {
    return "No worker profiles are available yet. Create a few skills to run the council.";
  }

  const councilIds = pickCouncilWorkers(profiles, 3);
  const prompt = [
    `Workers Council (${COUNCIL_TIMEBOX} timebox)`,
    `Topic: ${input.topic}`,
    "",
    "Return:",
    "- 2 bullet insights",
    "- 1 risk or assumption",
    "- 1 next step",
    "Keep it under 120 words.",
  ].join("\n");

  const settled = await Promise.allSettled(
    councilIds.map(async (workerId) => {
      await input.deps.orchestrator.ensureWorker({ workerId, reason: "manual" });
      const res = await input.deps.workers.send(workerId, prompt, { timeout: input.timeoutMs, from: "onboarding" });
      if (!res.success) {
        return { workerId, error: res.error ?? "worker error" } satisfies CouncilResponse;
      }
      return { workerId, response: res.response ?? "" } satisfies CouncilResponse;
    }),
  );

  const responses: CouncilResponse[] = settled.map((result, index) => {
    const workerId = councilIds[index] ?? `worker-${index + 1}`;
    if (result.status === "fulfilled") return result.value;
    return { workerId, error: result.reason instanceof Error ? result.reason.message : String(result.reason) };
  });

  const summaryWorkerId = pickSummaryWorkerId(profiles, ["reviewer", "product", "architect", "docs", "coder"]);
  let summaryText = "";
  if (summaryWorkerId) {
    try {
      await input.deps.orchestrator.ensureWorker({ workerId: summaryWorkerId, reason: "manual" });
      const summaryPrompt = [
        "Summarize the council responses into two short sections:",
        "Consensus Summary: 2-3 bullets.",
        "Next Steps: 2-3 bullets.",
        "",
        "Council responses:",
        formatCouncilResponses(responses),
      ].join("\n");
      const res = await input.deps.workers.send(summaryWorkerId, summaryPrompt, {
        timeout: Math.min(45_000, input.timeoutMs),
        from: "onboarding",
      });
      if (res.success && res.response) summaryText = res.response;
    } catch {
      summaryText = "";
    }
  }

  const fallbackNextSteps = [
    "Pick one worker to dive deeper on the highest-confidence insight.",
    "Run a built-in workflow to see multi-step orchestration.",
    "Tune worker profiles in Settings (model, temperature, enabled).",
  ];

  const summaryBlock =
    summaryText.trim().length > 0
      ? summaryText.trim()
      : `Consensus Summary:\n- The council produced ${responses.length} viewpoints on the onboarding focus.\n\nNext Steps:\n${fallbackNextSteps.map((s) => `- ${s}`).join("\n")}`;

  return ["Workers Council Output", formatCouncilResponses(responses), "", summaryBlock].join("\n");
};
