import type { ModelCapabilities } from "./capabilities";
import type { OrchestratorConfig } from "../types";

export function averageCostPer1kTokens(cap: ModelCapabilities): number | undefined {
  const input = cap.inputCostPer1kTokens;
  const output = cap.outputCostPer1kTokens;
  if (typeof input !== "number" && typeof output !== "number") return undefined;
  if (typeof input === "number" && typeof output === "number") return (input + output) / 2;
  return typeof input === "number" ? input : output;
}

export function scoreCost(cap: ModelCapabilities, selection?: OrchestratorConfig["modelSelection"]): {
  score: number;
  tooExpensive: boolean;
} {
  const mode = selection?.mode ?? "performance";
  const avg = averageCostPer1kTokens(cap);
  const max = selection?.maxCostPer1kTokens;

  if (typeof max === "number" && typeof avg === "number" && avg > max) {
    return { score: -100, tooExpensive: true };
  }

  if (mode === "performance") {
    return { score: 0, tooExpensive: false };
  }

  if (typeof avg !== "number") {
    return { score: mode === "economical" ? -20 : -5, tooExpensive: false };
  }

  const penalty = mode === "economical" ? avg * 100 : avg * 40;
  return { score: -penalty, tooExpensive: false };
}
