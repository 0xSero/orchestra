import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { deepMerge, getUserConfigDir, isPlainObject } from "../helpers/format";

const ORCHESTRATOR_PLUGIN_SUFFIXES = ["orchestrator.js", "orchestrator.mjs", "orchestrator.cjs", "orchestrator.ts"];
const ORCHESTRATOR_PLUGIN_PACKAGE = "opencode-orchestrator";

function isOrchestratorPlugin(entry: string): boolean {
  const normalized = entry.toLowerCase();
  if (normalized.includes(ORCHESTRATOR_PLUGIN_PACKAGE)) return true;
  return ORCHESTRATOR_PLUGIN_SUFFIXES.some((suffix) => normalized.includes(suffix));
}

function normalizePlugins(value: unknown, dropOrchestrator: boolean): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((entry) => typeof entry === "string")
    .filter((entry) => {
      if (!dropOrchestrator) return true;
      return !isOrchestratorPlugin(entry);
    });
}

function mergePlugins(
  base: unknown,
  override: unknown,
  options?: { dropOrchestrator?: boolean; append?: string[] },
): string[] {
  const dropOrchestrator = options?.dropOrchestrator ?? false;
  const baseList = normalizePlugins(base, dropOrchestrator);
  const overrideList = normalizePlugins(override, dropOrchestrator);
  const appendList = normalizePlugins(options?.append, dropOrchestrator);
  const merged = [...baseList, ...overrideList, ...appendList];
  return [...new Set(merged)];
}

export async function loadOpenCodeConfig(): Promise<Record<string, unknown>> {
  const configPath = join(getUserConfigDir(), "opencode", "opencode.json");
  if (!existsSync(configPath)) return {};
  try {
    const raw = await readFile(configPath, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    return isPlainObject(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

export async function mergeOpenCodeConfig(
  override?: Record<string, unknown>,
  options?: { dropOrchestratorPlugin?: boolean; appendPlugins?: string[] },
): Promise<Record<string, unknown>> {
  const base = await loadOpenCodeConfig();
  if (!override || Object.keys(override).length === 0) {
    if (options?.dropOrchestratorPlugin || (options?.appendPlugins?.length ?? 0) > 0) {
      const merged = isPlainObject(base) ? { ...base } : {};
      merged.plugin = mergePlugins(base?.plugin, undefined, {
        dropOrchestrator: options?.dropOrchestratorPlugin,
        append: options?.appendPlugins,
      });
      return merged;
    }
    return base;
  }
  if (!isPlainObject(base)) {
    const merged = { ...override };
    merged.plugin = mergePlugins(undefined, override?.plugin, {
      dropOrchestrator: options?.dropOrchestratorPlugin,
      append: options?.appendPlugins,
    });
    return merged;
  }
  const merged = deepMerge(base, override);
  merged.plugin = mergePlugins(base?.plugin, override?.plugin, {
    dropOrchestrator: options?.dropOrchestratorPlugin,
    append: options?.appendPlugins,
  });
  return merged;
}
