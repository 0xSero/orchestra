import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { deepMerge, getUserConfigDir, isPlainObject } from "../helpers/format";

const ORCHESTRATOR_PLUGIN_SUFFIXES = [
  "orchestrator.js",
  "orchestrator.mjs",
  "orchestrator.cjs",
  "orchestrator.ts",
];

function normalizePlugins(value: unknown, dropOrchestrator: boolean): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((entry) => typeof entry === "string")
    .filter((entry) => {
      if (!dropOrchestrator) return true;
      return !ORCHESTRATOR_PLUGIN_SUFFIXES.some((suffix) =>
        entry.includes(suffix),
      );
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

function isWithin(child: string, parent: string): boolean {
  const rel = relative(parent, child);
  if (!rel) return true;
  return !rel.startsWith(`..${sep}`) && rel !== ".." && !rel.startsWith("../");
}

function walkUp(start: string, stop: string): string[] {
  const paths: string[] = [];
  let current = start;
  while (true) {
    paths.push(current);
    if (current === stop) break;
    const next = dirname(current);
    if (next === current) break;
    current = next;
  }
  return paths;
}

function findGitRoot(start: string): string | undefined {
  let current = resolve(start);
  while (true) {
    if (existsSync(join(current, ".git"))) return current;
    const next = dirname(current);
    if (next === current) return undefined;
    current = next;
  }
}

function findNearestProjectOpenCodeConfig(
  start: string,
  stop: string,
): { base?: string; local?: string } | undefined {
  for (const current of walkUp(start, stop)) {
    const dot = join(current, ".opencode");
    const primary = join(dot, "opencode.json");
    const primaryLocal = join(dot, "opencode.local.json");
    const legacy = join(current, "opencode.json");
    const legacyLocal = join(current, "opencode.local.json");

    const base = existsSync(primary)
      ? primary
      : existsSync(legacy)
        ? legacy
        : undefined;
    const local = existsSync(primaryLocal)
      ? primaryLocal
      : existsSync(legacyLocal)
        ? legacyLocal
        : undefined;

    if (base || local) return { base, local };
  }
  return undefined;
}

async function readJsonIfExists(path: string | undefined) {
  if (!path) return {};
  if (!existsSync(path)) return {};
  try {
    const raw = await readFile(path, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    return isPlainObject(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

export async function loadOpenCodeConfig(): Promise<Record<string, unknown>> {
  const configPath = join(getUserConfigDir(), "opencode", "opencode.json");
  return await readJsonIfExists(configPath);
}

export async function mergeOpenCodeConfig(
  override?: Record<string, unknown>,
  options?: {
    dropOrchestratorPlugin?: boolean;
    appendPlugins?: string[];
    excludeAgentConfigs?: boolean;
    directory?: string;
    worktree?: string;
  },
): Promise<Record<string, unknown>> {
  const globalConfig = await loadOpenCodeConfig();
  const directory = resolve(options?.directory ?? process.cwd());
  const worktree = options?.worktree ? resolve(options.worktree) : undefined;
  const stop = (() => {
    if (worktree && isWithin(directory, worktree)) return worktree;
    return findGitRoot(directory) ?? directory;
  })();
  const projectPaths =
    findNearestProjectOpenCodeConfig(directory, stop) ??
    (worktree
      ? findNearestProjectOpenCodeConfig(
          worktree,
          findGitRoot(worktree) ?? worktree,
        )
      : undefined);
  const projectConfig = await readJsonIfExists(projectPaths?.base);
  const projectLocalConfig = await readJsonIfExists(projectPaths?.local);

  let base = deepMerge(
    deepMerge(globalConfig, projectConfig),
    projectLocalConfig,
  ) as Record<string, unknown>;

  // When spawning workers, exclude agent configs from global to prevent tool leakage.
  // Workers should only use their own tool config, not inherit from orchestrator agent.
  if (options?.excludeAgentConfigs && isPlainObject(base)) {
    const { agent: _dropped, ...rest } = base;
    base = rest;
  }

  const mergedPlugins = mergePlugins(
    mergePlugins(
      mergePlugins(globalConfig?.plugin, projectConfig?.plugin, {
        dropOrchestrator: options?.dropOrchestratorPlugin,
      }),
      projectLocalConfig?.plugin,
      { dropOrchestrator: options?.dropOrchestratorPlugin },
    ),
    override?.plugin,
    {
      dropOrchestrator: options?.dropOrchestratorPlugin,
      append: options?.appendPlugins,
    },
  );

  if (!override || Object.keys(override).length === 0) {
    if (
      options?.dropOrchestratorPlugin ||
      (options?.appendPlugins?.length ?? 0) > 0
    ) {
      const merged = isPlainObject(base) ? { ...base } : {};
      merged.plugin = mergedPlugins;
      return merged;
    }
    return base;
  }
  if (!isPlainObject(base)) {
    const merged = { ...override };
    merged.plugin = mergedPlugins;
    return merged;
  }
  const merged = deepMerge(base, override);
  merged.plugin = mergedPlugins;
  return merged;
}
