import type { Config, Model, Provider } from "@opencode-ai/sdk";
import { resolveModel } from "./resolver";

export type ModelCatalogEntry = {
  /** Full ID in provider/model format */
  full: string;
  providerID: string;
  modelID: string;
  name: string;
  status: Model["status"];
  capabilities: Model["capabilities"];
  limit: Model["limit"];
  cost: Model["cost"];
  providerSource: Provider["source"];
};

export function isFullModelID(value: string): boolean {
  return value.includes("/");
}

export function parseFullModelID(value: string): { providerID: string; modelID: string } {
  const [providerID, ...rest] = value.split("/");
  return { providerID, modelID: rest.join("/") };
}

export function fullModelID(providerID: string, modelID: string): string {
  return `${providerID}/${modelID}`;
}

export function flattenProviders(providers: Provider[]): ModelCatalogEntry[] {
  const out: ModelCatalogEntry[] = [];
  for (const provider of providers) {
    const models = provider.models ?? {};
    for (const [modelID, model] of Object.entries(models)) {
      out.push({
        full: fullModelID(provider.id, modelID),
        providerID: provider.id,
        modelID,
        name: (model as any).name ?? modelID,
        status: (model as any).status ?? "active",
        capabilities: (model as any).capabilities ?? {
          temperature: true,
          reasoning: false,
          attachment: false,
          toolcall: false,
          input: { text: true, audio: false, image: false, video: false, pdf: false },
          output: { text: true, audio: false, image: false, video: false, pdf: false },
        },
        limit: (model as any).limit ?? { context: 0, output: 0 },
        cost: (model as any).cost ?? { input: 0, output: 0, cache: { read: 0, write: 0 } },
        providerSource: provider.source,
      });
    }
  }
  return out;
}

export function filterProviders(providers: Provider[], scope: "configured" | "all"): Provider[] {
  if (scope === "all") return providers;

  // Filter to only providers that are usable (have credentials or are explicitly configured).
  //
  // The SDK's Provider.source field tells us how the provider was registered:
  //   - "config": Explicitly configured in opencode.json
  //   - "custom": Custom provider (npm package, explicitly configured)
  //   - "env": Auto-detected from environment variables (e.g., ANTHROPIC_API_KEY)
  //   - "api": From SDK's built-in API catalog (may or may not have credentials)
  //
  // For "configured" scope, we include:
  //   - "config" and "custom" sources (explicitly configured)
  //   - "env" sources (have environment-based credentials)
  //   - "api" sources that have a `key` set (connected via /connect)
  // The "opencode" provider is special and always available.
  return providers.filter((p) => {
    if (p.id === "opencode") return true;

    // Include explicitly configured providers
    if (p.source === "config" || p.source === "custom") return true;

    // Include environment-detected providers (they have API keys set)
    if (p.source === "env") return true;

    // For API catalog providers, check if they have credentials set.
    // The SDK's Provider type has an optional `key` field that's populated when
    // credentials are available (set via /connect command which stores in auth.json).
    if (p.source === "api" && p.key) return true;

    return false;
  });
}

export function resolveModelRef(
  input: string,
  providers: Provider[],
): { full: string; providerID: string; modelID: string } | { error: string; suggestions?: string[] } {
  const resolved = resolveModel(input, { providers });
  if ("error" in resolved) return resolved;
  return { full: resolved.full, providerID: resolved.providerID, modelID: resolved.modelID };
}

export function pickVisionModel(models: ModelCatalogEntry[]): ModelCatalogEntry | undefined {
  const score = (m: ModelCatalogEntry): number => {
    let s = 0;
    if (m.status === "deprecated") s -= 50;
    if (m.capabilities.toolcall) s += 10;
    if (m.capabilities.attachment) s += 10;
    if (m.capabilities.input?.image) s += 100;
    if (/\bvision\b/i.test(m.name) || /\bvision\b/i.test(m.modelID)) s += 20;
    if (/\bglm\b/i.test(m.modelID) && /4\\.6v/i.test(m.modelID)) s += 15;
    s += Math.min(Math.floor((m.limit?.context ?? 0) / 32000), 10);
    return s;
  };

  const candidates = models
    .filter((m) => m.capabilities?.attachment || m.capabilities?.input?.image)
    .sort((a, b) => score(b) - score(a));
  return candidates[0];
}

export function pickFastModel(models: ModelCatalogEntry[]): ModelCatalogEntry | undefined {
  const score = (m: ModelCatalogEntry): number => {
    let s = 0;
    if (m.status === "deprecated") s -= 50;
    if (m.capabilities.toolcall) s += 5;
    if (/(mini|small|flash|fast|haiku)/i.test(m.modelID) || /(mini|small|flash|fast|haiku)/i.test(m.name)) s += 10;
    if ((m.cost?.input ?? 0) > 0) s -= Math.min(m.cost.input, 5);
    if ((m.limit?.context ?? 0) > 0) s += Math.min(Math.floor(m.limit.context / 64000), 3);
    return s;
  };
  return [...models].sort((a, b) => score(b) - score(a))[0];
}

export function pickDocsModel(models: ModelCatalogEntry[]): ModelCatalogEntry | undefined {
  const score = (m: ModelCatalogEntry): number => {
    let s = 0;
    if (m.status === "deprecated") s -= 50;
    if (m.capabilities.toolcall) s += 10;
    if (m.capabilities.reasoning) s += 3;
    if (/minimax/i.test(m.modelID) || /minimax/i.test(m.name)) s += 8;
    if (/m2/i.test(m.modelID) || /m2/i.test(m.name)) s += 3;
    s += Math.min(Math.floor((m.limit?.context ?? 0) / 64000), 10);
    return s;
  };
  return [...models].sort((a, b) => score(b) - score(a))[0];
}

export async function fetchOpencodeConfig(client: any, directory: string): Promise<Config | undefined> {
  const res = await client.config.get({ query: { directory } }).catch(() => undefined);
  return res?.data as Config | undefined;
}

export async function fetchProviders(
  client: any,
  directory: string,
): Promise<{ providers: Provider[]; defaults: Record<string, string> }> {
  const res = await client.config.providers({ query: { directory } });
  return { providers: (res.data as any)?.providers ?? [], defaults: (res.data as any)?.default ?? {} };
}
