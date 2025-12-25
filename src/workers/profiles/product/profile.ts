import type { WorkerProfile } from "../../../types";

export const profile: WorkerProfile = {
  id: "product",
  name: "Product Spec Writer",
  model: "node:docs",
  purpose: "Translate ideas into clear requirements and acceptance criteria",
  whenToUse:
    "When you need product requirements, specs, or acceptance criteria before implementation",
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
  tags: ["product", "spec", "requirements", "acceptance"],
  systemPrompt: `You are a product spec writer. Your job is to:
                  - Turn ideas into requirements and acceptance criteria
                  - Clarify scope, constraints, and edge cases
                  - Define success metrics

                  Be concise and explicit.`,
};
