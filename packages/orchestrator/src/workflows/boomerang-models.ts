import type { Provider } from "@opencode-ai/sdk";
import type { WorkflowsConfig } from "../types";
import type { WorkflowDefinition } from "./types";
import {
  filterProviders,
  flattenProviders,
  resolveModelRef,
} from "../models/catalog";

export type BoomerangModels = {
  plannerModel: string;
  implementerModel: string;
};

export type BoomerangModelConfig = WorkflowsConfig["boomerang"];

const plannerSteps = new Set(["plan", "review"]);
const implementerSteps = new Set(["implement", "fix"]);

const defaultFallbackModel = (): string =>
  process.env.OPENCODE_ORCH_E2E_MODEL ?? "opencode/gpt-5-nano";

const buildSuggestionList = (providers: Provider[]): string[] => {
  const catalog = flattenProviders(providers);
  return catalog.map((entry) => entry.full).slice(0, 20);
};

export const resolveBoomerangModels = (input: {
  config?: BoomerangModelConfig;
  providers: Provider[];
  fallbackModel?: string;
}): BoomerangModels => {
  const configured = filterProviders(input.providers, "configured");
  const providers = configured.length > 0 ? configured : input.providers;
  const fallback = input.fallbackModel ?? defaultFallbackModel();

  const resolveModel = (label: string, value?: string): string => {
    const candidate = (value ?? fallback).trim();
    const resolved = resolveModelRef(candidate, providers);
    if ("error" in resolved) {
      const suggestions =
        resolved.suggestions ?? buildSuggestionList(providers);
      const suffix = suggestions.length
        ? `\nSuggestions:\n- ${suggestions.join("\n- ")}`
        : "";
      throw new Error(
        `Invalid ${label} model "${candidate}": ${resolved.error}${suffix}`,
      );
    }
    return resolved.full;
  };

  return {
    plannerModel: resolveModel("planner", input.config?.plannerModel),
    implementerModel: resolveModel(
      "implementer",
      input.config?.implementerModel,
    ),
  };
};

export const applyBoomerangModels = (
  workflow: WorkflowDefinition,
  models: BoomerangModels,
): WorkflowDefinition => {
  const steps = workflow.steps.map((step) => {
    if (plannerSteps.has(step.id)) {
      return { ...step, model: models.plannerModel };
    }
    if (implementerSteps.has(step.id)) {
      return { ...step, model: models.implementerModel };
    }
    return step;
  });
  return { ...workflow, steps };
};
