import type { Model } from "@opencode-ai/sdk";

export interface ModelCapabilities {
  supportsVision: boolean;
  supportsTools: boolean;
  supportsStreaming: boolean;
  contextWindow: number;
  maxOutputTokens: number;
  supportsReasoning: boolean;
  supportsWebSearch: boolean;
  supportsPDFAnalysis: boolean;
  supportsCodeExecution: boolean;
  inputCostPer1kTokens?: number;
  outputCostPer1kTokens?: number;
  averageLatencyMs?: number;
  throughputTokensPerSecond?: number;
}

function inferFromName(name: string): Partial<ModelCapabilities> {
  const lower = name.toLowerCase();
  return {
    supportsReasoning: /reasoning|thinking|r1|deepthink/.test(lower),
    supportsVision: /vision|multimodal|image/.test(lower),
    supportsWebSearch: /search|browse|web/.test(lower),
    supportsPDFAnalysis: /pdf/.test(lower),
  };
}

export function deriveModelCapabilities(input: {
  model: Model | Record<string, any> | undefined;
  modelId: string;
  modelName?: string;
  overrides?: Partial<ModelCapabilities>;
}): ModelCapabilities {
  const model = input.model as any;
  const capabilities = model?.capabilities ?? {};
  const inputCaps = capabilities?.input ?? {};
  const outputCaps = capabilities?.output ?? {};

  const inferred = inferFromName(`${input.modelName ?? ""} ${input.modelId}`.trim());

  const base: ModelCapabilities = {
    supportsVision: Boolean(capabilities?.attachment || inputCaps?.image) || Boolean(inferred.supportsVision),
    supportsTools: Boolean(capabilities?.toolcall || capabilities?.tools || capabilities?.function_calling),
    supportsStreaming: capabilities?.streaming ?? capabilities?.stream ?? true,
    contextWindow: Number(model?.limit?.context ?? 0),
    maxOutputTokens: Number(model?.limit?.output ?? 0),
    supportsReasoning: Boolean(capabilities?.reasoning) || Boolean(inferred.supportsReasoning),
    supportsWebSearch: Boolean(capabilities?.web) || Boolean(inferred.supportsWebSearch),
    supportsPDFAnalysis: Boolean(inputCaps?.pdf || outputCaps?.pdf) || Boolean(inferred.supportsPDFAnalysis),
    supportsCodeExecution: Boolean(capabilities?.toolcall || capabilities?.function_calling),
    inputCostPer1kTokens: typeof model?.cost?.input === "number" ? model.cost.input : undefined,
    outputCostPer1kTokens: typeof model?.cost?.output === "number" ? model.cost.output : undefined,
    averageLatencyMs: typeof model?.latency === "number" ? model.latency : undefined,
    throughputTokensPerSecond: typeof model?.throughput === "number" ? model.throughput : undefined,
  };

  return {
    ...base,
    ...(input.overrides ?? {}),
  };
}
