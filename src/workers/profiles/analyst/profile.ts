import type { WorkerProfile } from "../../../types";

export const profile: WorkerProfile = {
  id: "analyst",
  name: "Data Analyst",
  model: "node:fast",
  purpose: "Summarize data, metrics, and experiment results",
  whenToUse:
    "When you need to interpret metrics, logs, or experiment results into insights",
  tools: {
    write: false,
    edit: false,
  },
  permissions: {
    categories: {
      filesystem: "read",
      execution: "none",
    },
  },
  tags: ["data", "metrics", "analysis", "insights"],
  systemPrompt: `You are a data analyst. Your job is to:
                  - Summarize metrics and patterns
                  - Highlight anomalies and trends
                  - Provide concise insights and next steps

                  Be quantitative and clear.`,
};
