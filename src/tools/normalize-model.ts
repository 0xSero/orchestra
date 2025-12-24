import { fetchProviders } from "../models/catalog";
import { resolveModel } from "../models/resolver";
import type { OrchestratorConfig } from "../types";

export async function normalizeModelInput(
  model: string,
  input: {
    client: any;
    directory: string;
    modelAliases?: OrchestratorConfig["modelAliases"];
    modelSelection?: OrchestratorConfig["modelSelection"];
  }
): Promise<{ ok: true; model: string } | { ok: false; error: string }> {
  if (!input.client) return { ok: false, error: "OpenCode client not available; restart OpenCode." };
  const { providers } = await fetchProviders(input.client, input.directory);
  const resolved = resolveModel(model, {
    providers,
    aliases: input.modelAliases,
    selection: input.modelSelection,
  });
  if ("error" in resolved) {
    const suffix = resolved.suggestions?.length ? `\nSuggestions:\n- ${resolved.suggestions.join("\n- ")}` : "";
    return { ok: false, error: resolved.error + suffix };
  }
  return { ok: true, model: resolved.full };
}
