import type { PluginInput } from "@opencode-ai/plugin";
import type { WorkerProfile } from "../types";
import {
  fetchOpencodeConfig,
  fetchProviders,
  filterProviders,
  flattenProviders,
  pickDocsModel,
  pickFastModel,
  pickVisionModel,
} from "../models/catalog";

export type ModelResolutionContext = {
  client?: PluginInput["client"];
  directory: string;
  sessionID?: string;
};

async function getLastUsedModelFromSession(input: ModelResolutionContext): Promise<string | undefined> {
  if (!input.client) return undefined;
  if (!input.sessionID) return undefined;
  const res = await input.client.session
    .messages({ path: { id: input.sessionID }, query: { directory: input.directory, limit: 25 } })
    .catch(() => undefined);
  const messages = res?.data as any[] | undefined;
  if (!Array.isArray(messages)) return undefined;
  for (let i = messages.length - 1; i >= 0; i--) {
    const info = (messages[i] as any)?.info;
    if (info?.role !== "user") continue;
    const model = info?.model;
    if (model?.providerID && model?.modelID) return `${model.providerID}/${model.modelID}`;
  }
  return undefined;
}

export async function getFallbackModel(input: ModelResolutionContext): Promise<string> {
  const lastUsed = await getLastUsedModelFromSession(input);
  if (lastUsed) return lastUsed;
  if (input.client) {
    const cfg = await fetchOpencodeConfig(input.client, input.directory).catch(() => undefined);
    if (cfg?.model) return cfg.model;
  }
  return "opencode/gpt-5-nano";
}

export async function resolveAutoModel(input: ModelResolutionContext & { profile: WorkerProfile }): Promise<string> {
  const profile = input.profile;
  if (!input.client) return profile.model;
  if (!profile.model.startsWith("auto")) return profile.model;

  const fallback = await getFallbackModel(input);
  const { providers } = await fetchProviders(input.client, input.directory);
  const catalog = flattenProviders(filterProviders(providers, "configured"));

  const tag = profile.model;
  const isVision = profile.supportsVision || /auto:vision/i.test(tag);
  const isDocs = /auto:docs/i.test(tag);
  const isFast = /auto:fast/i.test(tag);

  const picked = isVision
    ? pickVisionModel(catalog)
    : isDocs
      ? pickDocsModel(catalog)
      : isFast
        ? pickFastModel(catalog)
        : undefined;

  return picked?.full ?? fallback;
}

