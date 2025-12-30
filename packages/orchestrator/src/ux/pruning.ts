import type { OrchestratorConfig } from "../types";

type WithParts = { info: any; parts: any[] };

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function shorten(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  const keepHead = Math.floor(maxChars * 0.6);
  const keepTail = maxChars - keepHead;
  return [
    text.slice(0, keepHead),
    `\n\n[... pruned ${text.length - maxChars} chars ...]\n\n`,
    text.slice(text.length - keepTail),
  ].join("");
}

export function createPruningTransform(pruning: OrchestratorConfig["pruning"]) {
  const enabled = pruning?.enabled === true;
  const maxToolOutputChars = clamp(pruning?.maxToolOutputChars ?? 12000, 1000, 200000);
  const maxToolInputChars = clamp(pruning?.maxToolInputChars ?? 4000, 500, 100000);
  const protectedTools = new Set(pruning?.protectedTools ?? ["task", "todowrite", "todoread"]);

  return async (_input: Record<string, unknown>, output: { messages: WithParts[] }) => {
    if (!enabled) return;

    for (const msg of output.messages) {
      for (const part of msg.parts ?? []) {
        if (part?.type !== "tool") continue;
        const toolName = String(part.tool ?? "");
        if (protectedTools.has(toolName)) continue;

        // Prune large outputs for completed tool calls
        if (part.state?.status === "completed" && typeof part.state.output === "string") {
          part.state.output = shorten(part.state.output, maxToolOutputChars);
        }

        // Prune large inputs for write/edit
        if ((toolName === "write" || toolName === "edit") && part.state?.input) {
          const input = part.state.input as Record<string, any>;
          if (typeof input.content === "string") {
            input.content = shorten(input.content, maxToolInputChars);
          }
        }
      }
    }
  };
}
