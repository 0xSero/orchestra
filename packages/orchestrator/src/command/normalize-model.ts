import { fetchProviders, resolveModelRef } from "../models/catalog";

export async function normalizeModelInput(
  model: string,
  input: { client: any; directory: string },
): Promise<{ ok: true; model: string } | { ok: false; error: string }> {
  if (!input.client)
    return {
      ok: false,
      error: "OpenCode client not available; restart OpenCode.",
    };
  const { providers } = await fetchProviders(input.client, input.directory);
  const resolved = resolveModelRef(model, providers);
  if ("error" in resolved) {
    const suffix = resolved.suggestions?.length
      ? `\nSuggestions:\n- ${resolved.suggestions.join("\n- ")}`
      : "";
    return { ok: false, error: resolved.error + suffix };
  }
  return { ok: true, model: resolved.full };
}
