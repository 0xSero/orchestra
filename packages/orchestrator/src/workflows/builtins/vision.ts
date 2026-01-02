import type { WorkflowDefinition } from "../types";

export const VISION_WORKFLOW_ID = "vision";

const defaultPrompt = [
  "You are the vision analysis specialist.",
  "Analyze the attached image(s). If there is user-provided context, use it to focus the analysis.",
  "",
  "User context:",
  "{task}",
  "",
  "Return a concise, structured summary with headings:",
  "- Summary",
  "- Text (OCR)",
  "- Key elements",
  "- Issues or questions",
].join("\n");

export function buildVisionWorkflow(): WorkflowDefinition {
  return {
    id: VISION_WORKFLOW_ID,
    name: "Vision Analysis",
    description:
      "Analyze images and return a structured summary for the orchestrator.",
    steps: [
      {
        id: "analyze",
        title: "Analyze Image",
        workerId: "vision",
        prompt: defaultPrompt,
        carry: false,
      },
    ],
  };
}
