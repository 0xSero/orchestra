export type ModelAliasMap = Record<string, string>;

export function normalizeAliases(input?: ModelAliasMap): ModelAliasMap {
  const out: ModelAliasMap = {};
  if (!input) return out;
  for (const [key, value] of Object.entries(input)) {
    if (typeof value !== "string") continue;
    out[key.toLowerCase()] = value;
  }
  return out;
}

export function resolveAlias(input: string, aliases?: ModelAliasMap): string | undefined {
  if (!aliases) return undefined;
  const normalized = input.trim().toLowerCase();
  return aliases[normalized];
}
