/**
 * Custom tools for the orchestrator plugin
 */

import { tool } from "@opencode-ai/plugin";
import type { PluginInput } from "@opencode-ai/plugin";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { loadOrchestratorConfig, getDefaultGlobalOrchestratorConfigPath, getDefaultProjectOrchestratorConfigPath } from "../config/orchestrator";
import { registry } from "../core/registry";
import { sendToWorker, spawnWorker, spawnWorkers, stopWorker } from "../workers/spawner";
import { getProfile, builtInProfiles } from "../config/profiles";
import type { OrchestratorConfigFile, WorkerProfile } from "../types";
import {
  fetchOpencodeConfig,
  fetchProviders,
  filterProviders,
  flattenProviders,
  pickDocsModel,
  pickFastModel,
  pickVisionModel,
  resolveModelRef,
} from "../models/catalog";
import { hydrateProfileModelsFromOpencode } from "../models/hydrate";
import { loadNeo4jConfigFromEnv } from "../memory/neo4j";
import { linkMemory, recentMemory, searchMemory, upsertMemory, type MemoryScope } from "../memory/graph";

// Module-level directory reference (set by plugin init)
let _directory = process.cwd();
let _spawnDefaults = { basePort: 14096, timeout: 30000 };
let _profiles: Record<string, WorkerProfile> = builtInProfiles;
let _client: PluginInput["client"] | undefined;
let _defaultListFormat: "markdown" | "json" = "markdown";
let _worktree: string | undefined;
let _projectId: string | undefined;

type ToolContext = {
  agent?: string;
  sessionID?: string;
  messageID?: string;
};

export function setDirectory(dir: string) {
  _directory = dir;
}

export function setWorktree(worktree: string) {
  _worktree = worktree;
}

export function setProjectId(projectId: string) {
  _projectId = projectId;
}

export function setClient(client: PluginInput["client"]) {
  _client = client;
}

export function setSpawnDefaults(input: { basePort: number; timeout: number }) {
  _spawnDefaults = input;
}

export function setProfiles(profiles: Record<string, WorkerProfile>) {
  _profiles = profiles;
}

export function setUiDefaults(input: { defaultListFormat?: "markdown" | "json" }) {
  if (input.defaultListFormat) _defaultListFormat = input.defaultListFormat;
}

function toBool(v: unknown): boolean {
  return v === true;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function readConfigFile(path: string): Promise<OrchestratorConfigFile> {
  if (!existsSync(path)) return {};
  try {
    const raw = JSON.parse(await readFile(path, "utf8")) as unknown;
    if (!isPlainObject(raw)) return {};
    return raw as OrchestratorConfigFile;
  } catch {
    return {};
  }
}

async function writeConfigFile(path: string, data: OrchestratorConfigFile): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(data, null, 2) + "\n", "utf8");
}

function upsertProfileEntry(
  config: OrchestratorConfigFile,
  profileId: string,
  patch: Partial<WorkerProfile>
): OrchestratorConfigFile {
  const profiles = Array.isArray(config.profiles) ? [...config.profiles] : [];

  let found = false;
  for (let i = 0; i < profiles.length; i++) {
    const entry = profiles[i];
    if (typeof entry === "string") {
      if (entry === profileId) {
        profiles[i] = { id: profileId, ...patch } as WorkerProfile;
        found = true;
      }
      continue;
    }
    if (entry && typeof entry === "object" && "id" in entry && (entry as any).id === profileId) {
      profiles[i] = { ...(entry as WorkerProfile), ...patch, id: profileId };
      found = true;
    }
  }

  if (!found) profiles.push({ id: profileId, ...patch } as WorkerProfile);
  return { ...config, profiles };
}

function setSpawnList(config: OrchestratorConfigFile, profileIds: string[]): OrchestratorConfigFile {
  return { ...config, workers: [...new Set(profileIds)] };
}

function configPathForScope(scope: "global" | "project"): string {
  if (scope === "global") return getDefaultGlobalOrchestratorConfigPath();
  return getDefaultProjectOrchestratorConfigPath(_directory);
}

function renderMarkdownTable(headers: string[], rows: string[][]): string {
  const esc = (s: string) => s.replace(/\|/g, "\\|");
  const head = `| ${headers.join(" | ")} |`;
  const sep = `| ${headers.map(() => "---").join(" | ")} |`;
  const body = rows
    .map((r) => `| ${r.map((c) => esc(c.replace(/\n/g, " "))).join(" | ")} |`)
    .join("\n");
  return [head, sep, body].filter(Boolean).join("\n");
}

async function getLastUsedModelFromSession(ctx?: ToolContext): Promise<string | undefined> {
  if (!_client) return undefined;
  if (!ctx?.sessionID) return undefined;
  const res = await _client.session
    .messages({ path: { id: ctx.sessionID }, query: { directory: _directory, limit: 25 } })
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

async function getFallbackModel(ctx?: ToolContext): Promise<string> {
  const lastUsed = await getLastUsedModelFromSession(ctx);
  if (lastUsed) return lastUsed;
  if (_client) {
    const cfg = await fetchOpencodeConfig(_client, _directory).catch(() => undefined);
    if (cfg?.model) return cfg.model;
  }
  return "opencode/gpt-5-nano";
}

async function resolveAutoModel(profile: WorkerProfile, ctx?: ToolContext): Promise<string> {
  if (!_client) return profile.model;
  if (!profile.model.startsWith("auto")) return profile.model;

  const fallback = await getFallbackModel(ctx);
  const { providers } = await fetchProviders(_client, _directory);
  const catalog = flattenProviders(filterProviders(providers, "configured"));

  const tag = profile.model;
  const isVision = profile.supportsVision || /auto:vision/i.test(tag);
  const isDocs = /auto:docs/i.test(tag);
  const isFast = /auto:fast/i.test(tag);

  const picked = isVision ? pickVisionModel(catalog) : isDocs ? pickDocsModel(catalog) : isFast ? pickFastModel(catalog) : undefined;
  return picked?.full ?? fallback;
}

async function normalizeModelInput(model: string): Promise<{ ok: true; model: string } | { ok: false; error: string }> {
  if (!_client) return { ok: false, error: "OpenCode client not available; restart OpenCode." };
  const { providers } = await fetchProviders(_client, _directory);
  const resolved = resolveModelRef(model, providers);
  if ("error" in resolved) {
    const suffix = resolved.suggestions?.length ? `\nSuggestions:\n- ${resolved.suggestions.join("\n- ")}` : "";
    return { ok: false, error: resolved.error + suffix };
  }
  return { ok: true, model: resolved.full };
}

/**
 * Tool to list all available workers and their status
 */
export const listWorkers = tool({
  description: "List all available workers in the orchestrator registry with their status and capabilities",
  args: {
    format: tool.schema.enum(["markdown", "json"]).optional().describe("Output format (default: markdown)"),
  },
  async execute(args) {
    const workers = registry.toJSON() as Array<Record<string, any>>;
    if (workers.length === 0) {
      return "No workers are currently registered. Use spawn_worker to create workers.";
    }

    const format: "markdown" | "json" = args.format ?? _defaultListFormat;
    const rows = workers.map((w) => [
      String(w.id),
      String(w.name),
      String(w.status),
      String(w.model),
      toBool(w.supportsVision) ? "yes" : "no",
      toBool(w.supportsWeb) ? "yes" : "no",
      String(w.port),
      String(w.purpose),
    ]);

    return format === "json"
      ? JSON.stringify(workers, null, 2)
      : renderMarkdownTable(["ID", "Name", "Status", "Model", "Vision", "Web", "Port", "Purpose"], rows);
  },
});

/**
 * Tool to list all available worker profiles (built-in + custom from config)
 */
export const listProfiles = tool({
  description:
    "List all available worker profiles that can be spawned (built-in + any custom profiles loaded from orchestrator.json)",
  args: {
    format: tool.schema.enum(["markdown", "json"]).optional().describe("Output format (default: markdown)"),
  },
  async execute(args) {
    const profiles = Object.values(_profiles)
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((p) => ({
        id: p.id,
        name: p.name,
        model: p.model,
        purpose: p.purpose,
        whenToUse: p.whenToUse,
        supportsVision: p.supportsVision ?? false,
        supportsWeb: p.supportsWeb ?? false,
      }));

    if (profiles.length === 0) return "No profiles available.";

    const format: "markdown" | "json" = args.format ?? _defaultListFormat;
    const rows = profiles.map((p) => [
      p.id,
      p.name,
      p.model,
      p.supportsVision ? "yes" : "no",
      p.supportsWeb ? "yes" : "no",
      p.purpose,
    ]);
    return format === "json"
      ? JSON.stringify(profiles, null, 2)
      : renderMarkdownTable(["ID", "Name", "Model", "Vision", "Web", "Purpose"], rows);
  },
});

export const listModels = tool({
  description:
    "List models available in your current OpenCode configuration (via the SDK). Use this to pick valid provider/model IDs for profiles.",
  args: {
    scope: tool.schema
      .enum(["configured", "all"])
      .optional()
      .describe("Which providers to include (default: configured = non-api providers + opencode)"),
    query: tool.schema.string().optional().describe("Filter by substring (matches provider, model id, name, or full id)"),
    limit: tool.schema.number().optional().describe("Max results (default: 40)"),
    format: tool.schema.enum(["markdown", "json"]).optional().describe("Output format (default: markdown)"),
  },
  async execute(args) {
    if (!_client) return "OpenCode client not available; restart OpenCode.";

    const { providers } = await fetchProviders(_client, _directory);
    const scoped = filterProviders(providers, args.scope ?? "configured");
    let models = flattenProviders(scoped);

    const q = args.query?.trim().toLowerCase();
    if (q) {
      models = models.filter(
        (m) =>
          m.full.toLowerCase().includes(q) ||
          m.providerID.toLowerCase().includes(q) ||
          m.modelID.toLowerCase().includes(q) ||
          m.name.toLowerCase().includes(q)
      );
    }

    models.sort((a, b) => a.full.localeCompare(b.full));
    const limited = models.slice(0, Math.max(1, args.limit ?? 40));

    const format: "markdown" | "json" = args.format ?? _defaultListFormat;
    if (format === "json") return JSON.stringify(limited, null, 2);

    const rows = limited.map((m) => [
      m.full,
      m.name,
      String(m.limit?.context ?? ""),
      m.capabilities?.input?.image ? "yes" : "no",
      m.capabilities?.attachment ? "yes" : "no",
      m.capabilities?.toolcall ? "yes" : "no",
      m.capabilities?.reasoning ? "yes" : "no",
      m.status,
    ]);

    return [
      renderMarkdownTable(["Model (provider/model)", "Name", "Ctx", "Vision", "Attach", "Tools", "Reason", "Status"], rows),
      "",
      "Tip: Copy the full `provider/model` ID into `set_profile_model({ ... })`.",
    ].join("\n");
  },
});

export const autofillProfileModels = tool({
  description:
    "Populate worker profile models using your current OpenCode model (last used) and configured providers. Great for first-time setup.",
  args: {
    scope: tool.schema.enum(["global", "project"]).describe("Where to write config"),
    profileIds: tool.schema
      .array(tool.schema.string())
      .optional()
      .describe("Which profile IDs to update (default: built-in profiles)"),
    setAgent: tool.schema.boolean().optional().describe("Also set orchestrator agent model to the current model (default: true)"),
    force: tool.schema.boolean().optional().describe("Override existing saved models (default: false)"),
    showToast: tool.schema.boolean().optional().describe("Show a toast with what changed (default: true)"),
  },
  async execute(args, ctx: ToolContext) {
    if (!_client) return "OpenCode client not available; restart OpenCode.";

    const force = args.force ?? false;
    const setAgent = args.setAgent ?? true;
    const showToast = args.showToast ?? true;

    const currentModel = await getFallbackModel(ctx);
    const { providers } = await fetchProviders(_client, _directory);
    const catalog = flattenProviders(filterProviders(providers, "configured"));

    const ids = args.profileIds?.length ? [...new Set(args.profileIds)] : Object.keys(builtInProfiles);
    const path = configPathForScope(args.scope);
    const existing = await readConfigFile(path);

    const changed: Array<{ id: string; from: string; to: string }> = [];
    let next: OrchestratorConfigFile = existing;

    for (const id of ids) {
      const base = getProfile(id, _profiles) ?? builtInProfiles[id];
      if (!base) continue;

      const hasSavedOverride =
        Array.isArray(existing.profiles) &&
        existing.profiles.some((p: any) => typeof p === "object" && p && (p as any).id === id && typeof (p as any).model === "string");
      if (hasSavedOverride && !force) continue;

      const desired =
        base.supportsVision || id === "vision"
          ? pickVisionModel(catalog)?.full ?? currentModel
          : id === "docs"
            ? pickDocsModel(catalog)?.full ?? currentModel
            : id === "explorer"
              ? pickFastModel(catalog)?.full ?? currentModel
              : currentModel;

      if (!force && !base.model.startsWith("auto") && base.model !== desired) {
        // Respect non-auto defaults unless explicitly forced.
        continue;
      }

      next = upsertProfileEntry(next, id, { model: desired });
      const prior = base.model;
      _profiles[id] = { ...base, model: desired };
      if (prior !== desired) changed.push({ id, from: prior, to: desired });
    }

    if (setAgent) {
      const existingAgent = isPlainObject(existing.agent) ? (existing.agent as any) : {};
      if (force || typeof existingAgent.model !== "string") {
        next = { ...next, agent: { ...existingAgent, model: currentModel } };
      }
    }

    await writeConfigFile(path, next);

    if (showToast && _client) {
      const msg =
        changed.length === 0
          ? "No profile models changed."
          : `Updated models for: ${changed.map((c) => c.id).join(", ")}`;
      void _client.tui.showToast({ body: { message: msg, variant: changed.length ? "success" : "info" } }).catch(() => {});
    }

    if (changed.length === 0) {
      return [
        `Wrote config: ${path}`,
        `- current model: ${currentModel}`,
        "",
        "No changes were applied (use force:true to override saved models).",
      ].join("\n");
    }

    const rows = changed.map((c) => [c.id, c.from, c.to]);
    return [
      `Wrote config: ${path}`,
      `- current model: ${currentModel}`,
      "",
      renderMarkdownTable(["Profile", "From", "To"], rows),
      "",
      "Tip: Run list_profiles({}) to confirm, then spawn_worker({ profileId: 'vision' }) etc.",
    ].join("\n");
  },
});

export const orchestratorConfig = tool({
  description: "Show the effective orchestrator configuration (merged global + project) and worker→model mapping",
  args: {
    format: tool.schema.enum(["markdown", "json"]).optional().describe("Output format (default: markdown)"),
  },
  async execute(args) {
    const format = args.format ?? _defaultListFormat;
    const { config, sources } = await loadOrchestratorConfig({ directory: _directory, worktree: _worktree });

    // Show the hydrated (runtime) view, not just the raw file values.
    if (_client) {
      try {
        const hydrated = await hydrateProfileModelsFromOpencode({
          client: _client,
          directory: _directory,
          profiles: config.profiles,
        });
        config.profiles = hydrated.profiles;
      } catch {
        // ignore
      }
    }

    const profileRows = Object.values(config.profiles)
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((p) => [p.id, p.name, p.model, p.supportsVision ? "yes" : "no", p.supportsWeb ? "yes" : "no"]);

    if (format === "json") {
      return JSON.stringify(
        {
          sources,
          basePort: config.basePort,
          autoSpawn: config.autoSpawn,
          spawn: config.spawn,
          ui: config.ui,
          agent: config.agent,
          commands: config.commands,
          profiles: Object.values(config.profiles).map((p) => ({ id: p.id, name: p.name, model: p.model })),
        },
        null,
        2
      );
    }

    return [
      "# Orchestrator Config",
      "",
      `- Global: ${sources.global ?? "(none)"}`,
      `- Project: ${sources.project ?? "(none)"}`,
      "",
      `- autoSpawn: ${config.autoSpawn ? "true" : "false"}`,
      `- spawn: ${config.spawn.length ? config.spawn.join(", ") : "(none)"}`,
      `- basePort: ${config.basePort}`,
      `- startupTimeout: ${config.startupTimeout}ms`,
      "",
      "## Profiles (worker → model)",
      renderMarkdownTable(["ID", "Name", "Model", "Vision", "Web"], profileRows),
      "",
    ].join("\n");
  },
});

export const setProfileModel = tool({
  description:
    "Persistently set which model a worker profile uses (writes to orchestrator.json). This is the main way to map workers→models.",
  args: {
    scope: tool.schema.enum(["global", "project"]).describe("Where to write config"),
    profileId: tool.schema.string().describe("Worker profile ID (e.g. 'docs', 'coder')"),
    model: tool.schema.string().describe("Model ID to use (must be in provider/model format)"),
    name: tool.schema.string().optional().describe("Required for brand-new custom profiles"),
    purpose: tool.schema.string().optional().describe("Required for brand-new custom profiles"),
    whenToUse: tool.schema.string().optional().describe("Required for brand-new custom profiles"),
    systemPrompt: tool.schema.string().optional().describe("Optional system prompt"),
    temperature: tool.schema.number().optional().describe("Optional temperature override"),
    supportsVision: tool.schema.boolean().optional().describe("Mark the profile as vision-capable"),
    supportsWeb: tool.schema.boolean().optional().describe("Mark the profile as web-capable"),
    tags: tool.schema.array(tool.schema.string()).optional().describe("Optional matching tags"),
  },
  async execute(args) {
    const normalized = await normalizeModelInput(args.model);
    if (!normalized.ok) return normalized.error;

    const base = _profiles[args.profileId] ?? builtInProfiles[args.profileId];
    if (!base) {
      if (!args.name || !args.purpose || !args.whenToUse) {
        return [
          `Profile "${args.profileId}" is not a built-in profile.`,
          "To create a new custom profile via this tool, you must provide: name, purpose, whenToUse.",
          "Alternatively, edit orchestrator.json manually and add a full profile object.",
        ].join("\n");
      }
    }

    const path = configPathForScope(args.scope);
    const existing = await readConfigFile(path);
    const next = upsertProfileEntry(existing, args.profileId, {
      model: normalized.model,
      ...(args.name ? { name: args.name } : {}),
      ...(args.purpose ? { purpose: args.purpose } : {}),
      ...(args.whenToUse ? { whenToUse: args.whenToUse } : {}),
      ...(args.systemPrompt ? { systemPrompt: args.systemPrompt } : {}),
      ...(typeof args.temperature === "number" ? { temperature: args.temperature } : {}),
      ...(typeof args.supportsVision === "boolean" ? { supportsVision: args.supportsVision } : {}),
      ...(typeof args.supportsWeb === "boolean" ? { supportsWeb: args.supportsWeb } : {}),
      ...(args.tags ? { tags: args.tags } : {}),
    });
    await writeConfigFile(path, next);

    _profiles[args.profileId] = {
      ...(base ?? ({} as WorkerProfile)),
      ...(args.name ? { name: args.name } : {}),
      ...(args.purpose ? { purpose: args.purpose } : {}),
      ...(args.whenToUse ? { whenToUse: args.whenToUse } : {}),
      ...(args.systemPrompt ? { systemPrompt: args.systemPrompt } : {}),
      ...(typeof args.temperature === "number" ? { temperature: args.temperature } : {}),
      ...(typeof args.supportsVision === "boolean" ? { supportsVision: args.supportsVision } : {}),
      ...(typeof args.supportsWeb === "boolean" ? { supportsWeb: args.supportsWeb } : {}),
      ...(args.tags ? { tags: args.tags } : {}),
      model: normalized.model,
      id: args.profileId,
    };

    return [
      `Saved profile override for "${args.profileId}" in ${args.scope} config:`,
      `- file: ${path}`,
      `- model: ${normalized.model}`,
      "",
      "Tip: restart OpenCode if you want injected command shortcuts to refresh; spawning uses the new model immediately.",
    ].join("\n");
  },
});

export const setAutoSpawn = tool({
  description: "Configure which workers auto-spawn on startup (writes to orchestrator.json)",
  args: {
    scope: tool.schema.enum(["global", "project"]).describe("Where to write config"),
    autoSpawn: tool.schema.boolean().describe("Enable/disable auto-spawn"),
    workers: tool.schema.array(tool.schema.string()).describe("Profile IDs to auto-spawn"),
  },
  async execute(args) {
    const path = configPathForScope(args.scope);
    const existing = await readConfigFile(path);
    const next: OrchestratorConfigFile = setSpawnList({ ...existing, autoSpawn: args.autoSpawn }, args.workers);
    await writeConfigFile(path, next);
    return `Saved auto-spawn config in ${args.scope} file: ${path}`;
  },
});

export const setOrchestratorAgent = tool({
  description: "Configure the injected orchestrator agent (name/model/mode) in orchestrator.json",
  args: {
    scope: tool.schema.enum(["global", "project"]).describe("Where to write config"),
    enabled: tool.schema.boolean().optional().describe("Enable/disable agent injection"),
    name: tool.schema.string().optional().describe("Agent name (default: orchestrator)"),
    model: tool.schema.string().optional().describe("Agent model (provider/model). Tip: use list_models({}) to copy."),
    mode: tool.schema.enum(["primary", "subagent"]).optional().describe("Agent mode"),
    color: tool.schema.string().optional().describe("Hex color (e.g. #6495ED)"),
  },
  async execute(args) {
    const path = configPathForScope(args.scope);
    const existing = await readConfigFile(path);
    let model = args.model;
    if (typeof model === "string") {
      const normalized = await normalizeModelInput(model);
      if (!normalized.ok) return normalized.error;
      model = normalized.model;
    }
    const agent = {
      ...(existing.agent ?? {}),
      ...(typeof args.enabled === "boolean" ? { enabled: args.enabled } : {}),
      ...(args.name ? { name: args.name } : {}),
      ...(model ? { model } : {}),
      ...(args.mode ? { mode: args.mode } : {}),
      ...(args.color ? { color: args.color } : {}),
    };
    const next: OrchestratorConfigFile = { ...existing, agent };
    await writeConfigFile(path, next);
    return `Saved agent config in ${args.scope} file: ${path}`;
  },
});

export const memoryPut = tool({
  description:
    "Upsert a memory entry into Neo4j (requires env: OPENCODE_NEO4J_URI/USERNAME/PASSWORD). Stores to global or per-project graph.",
  args: {
    scope: tool.schema.enum(["project", "global"]).optional().describe("Memory scope (default: project)"),
    key: tool.schema.string().describe("Stable key (e.g. 'architecture:db', 'decision:use-minimax')"),
    value: tool.schema.string().describe("Memory content (concise, no secrets)"),
    tags: tool.schema.array(tool.schema.string()).optional().describe("Optional tags"),
  },
  async execute(args) {
    const cfg = loadNeo4jConfigFromEnv();
    if (!cfg) {
      return "Neo4j is not configured. Set env vars: OPENCODE_NEO4J_URI, OPENCODE_NEO4J_USERNAME, OPENCODE_NEO4J_PASSWORD (and optional OPENCODE_NEO4J_DATABASE).";
    }

    const scope: MemoryScope = args.scope ?? "project";
    const projectId = scope === "project" ? _projectId : undefined;
    if (scope === "project" && !projectId) return "Missing projectId; restart OpenCode.";

    const node = await upsertMemory({
      cfg,
      scope,
      projectId,
      key: args.key,
      value: args.value,
      tags: args.tags ?? [],
    });

    if (_client) {
      void _client.tui
        .showToast({ body: { message: `Saved memory: ${node.key} (${node.scope})`, variant: "success" } })
        .catch(() => {});
    }

    return JSON.stringify(node, null, 2);
  },
});

export const memoryLink = tool({
  description: "Create a relationship between two memory keys in Neo4j (RELATES_TO).",
  args: {
    scope: tool.schema.enum(["project", "global"]).optional().describe("Memory scope (default: project)"),
    fromKey: tool.schema.string().describe("Source key"),
    toKey: tool.schema.string().describe("Target key"),
    type: tool.schema.string().optional().describe("Relationship type label (default: relates_to)"),
  },
  async execute(args) {
    const cfg = loadNeo4jConfigFromEnv();
    if (!cfg) {
      return "Neo4j is not configured. Set env vars: OPENCODE_NEO4J_URI, OPENCODE_NEO4J_USERNAME, OPENCODE_NEO4J_PASSWORD (and optional OPENCODE_NEO4J_DATABASE).";
    }

    const scope: MemoryScope = args.scope ?? "project";
    const projectId = scope === "project" ? _projectId : undefined;
    if (scope === "project" && !projectId) return "Missing projectId; restart OpenCode.";

    await linkMemory({ cfg, scope, projectId, fromKey: args.fromKey, toKey: args.toKey, type: args.type });
    return `Linked ${args.fromKey} -> ${args.toKey}`;
  },
});

export const memorySearchTool = tool({
  description: "Search memory graph entries in Neo4j by query.",
  args: {
    scope: tool.schema.enum(["project", "global"]).optional().describe("Memory scope (default: project)"),
    query: tool.schema.string().describe("Search query"),
    limit: tool.schema.number().optional().describe("Max results (default: 10)"),
    format: tool.schema.enum(["markdown", "json"]).optional().describe("Output format (default: markdown)"),
  },
  async execute(args) {
    const cfg = loadNeo4jConfigFromEnv();
    if (!cfg) {
      return "Neo4j is not configured. Set env vars: OPENCODE_NEO4J_URI, OPENCODE_NEO4J_USERNAME, OPENCODE_NEO4J_PASSWORD (and optional OPENCODE_NEO4J_DATABASE).";
    }

    const scope: MemoryScope = args.scope ?? "project";
    const projectId = scope === "project" ? _projectId : undefined;
    if (scope === "project" && !projectId) return "Missing projectId; restart OpenCode.";

    const results = await searchMemory({ cfg, scope, projectId, query: args.query, limit: args.limit ?? 10 });
    const format = args.format ?? _defaultListFormat;
    if (format === "json") return JSON.stringify(results, null, 2);

    if (results.length === 0) return "No matches.";
    return results
      .map((r) => `- \`${r.key}\` (${r.scope})${r.tags.length ? ` [${r.tags.join(", ")}]` : ""}\n  - ${r.value}`)
      .join("\n");
  },
});

export const memoryRecentTool = tool({
  description: "List recent memory entries.",
  args: {
    scope: tool.schema.enum(["project", "global"]).optional().describe("Memory scope (default: project)"),
    limit: tool.schema.number().optional().describe("Max results (default: 10)"),
    format: tool.schema.enum(["markdown", "json"]).optional().describe("Output format (default: markdown)"),
  },
  async execute(args) {
    const cfg = loadNeo4jConfigFromEnv();
    if (!cfg) {
      return "Neo4j is not configured. Set env vars: OPENCODE_NEO4J_URI, OPENCODE_NEO4J_USERNAME, OPENCODE_NEO4J_PASSWORD (and optional OPENCODE_NEO4J_DATABASE).";
    }

    const scope: MemoryScope = args.scope ?? "project";
    const projectId = scope === "project" ? _projectId : undefined;
    if (scope === "project" && !projectId) return "Missing projectId; restart OpenCode.";

    const results = await recentMemory({ cfg, scope, projectId, limit: args.limit ?? 10 });
    const format = args.format ?? _defaultListFormat;
    if (format === "json") return JSON.stringify(results, null, 2);
    if (results.length === 0) return "No memory entries.";
    return results.map((r) => `- \`${r.key}\` (${r.scope}) - ${r.value}`).join("\n");
  },
});

export const orchestratorHelp = tool({
  description: "Show help for using the orchestrator plugin (workers, profiles, delegation)",
  args: {},
  async execute() {
    return [
      "# Orchestrator",
      "",
      "## Quick start",
      "- `list_models({})` to see your available OpenCode models",
      "- `autofill_profile_models({ scope: 'global' })` to auto-populate profile→model mapping from your current model",
      "- `list_profiles({})` to see what you can spawn",
      "- `spawn_worker({ profileId: 'vision' })` (or `docs`, `coder`, `architect`, `explorer`)",
      "- `list_workers({})` to see running workers",
      "- `delegate_task({ task: '...', requiresVision: true })` to auto-route + run",
      "",
      "## Direct messaging",
      "- `ask_worker({ workerId: 'docs', message: 'Find official API docs for ...' })`",
      "",
      "## Tips",
      "- Vision tasks: screenshots, diagrams, OCR",
      "- Docs tasks: citations, examples, API lookups",
      "- Coder tasks: implement changes, run commands",
      "",
    ].join("\n");
  },
});

/**
 * Tool to send a message to a specific worker
 */
export const askWorker = tool({
  description: `Send a message to a specialized worker and get a response. Use this to delegate tasks to workers with specific capabilities.
  
Available workers depend on what's been spawned. Common workers:
- vision: For analyzing images and visual content
- docs: For researching documentation and examples  
- coder: For writing and editing code
- architect: For system design and planning
- explorer: For quick codebase searches`,
  args: {
    workerId: tool.schema.string().describe("ID of the worker to message (e.g., 'vision', 'docs', 'coder')"),
    message: tool.schema.string().describe("The message/question to send to the worker"),
    imageBase64: tool.schema.string().optional().describe("Optional base64-encoded image to send (for vision workers)"),
    attachments: tool.schema
      .array(
        tool.schema.object({
          type: tool.schema.enum(["image", "file"]),
          path: tool.schema.string().optional(),
          base64: tool.schema.string().optional(),
          mimeType: tool.schema.string().optional(),
        })
      )
      .optional()
      .describe("Optional attachments array (preferred when called from OpenCode with attachments)"),
  },
  async execute(args) {
    const { workerId, message, imageBase64 } = args;

    const attachments =
      args.attachments && args.attachments.length > 0
        ? args.attachments
        : imageBase64
          ? [{ type: "image" as const, base64: imageBase64 }]
          : undefined;

    const result = await sendToWorker(workerId, message, { attachments });

    if (!result.success) {
      return `Error communicating with worker "${workerId}": ${result.error}`;
    }

    return result.response ?? "Worker returned empty response";
  },
});

/**
 * Tool to get detailed info about a specific worker
 */
export const getWorkerInfo = tool({
  description: "Get detailed information about a specific worker including its purpose, model, and current status",
  args: {
    workerId: tool.schema.string().describe("ID of the worker to get info about"),
    format: tool.schema.enum(["markdown", "json"]).optional().describe("Output format (default: markdown)"),
  },
  async execute(args) {
    const instance = registry.getWorker(args.workerId);
    if (!instance) {
      return `Worker "${args.workerId}" not found. Use list_workers to see available workers.`;
    }

    const data = {
      id: instance.profile.id,
      name: instance.profile.name,
      model: instance.profile.model,
      purpose: instance.profile.purpose,
      whenToUse: instance.profile.whenToUse,
      status: instance.status,
      port: instance.port,
      supportsVision: instance.profile.supportsVision ?? false,
      supportsWeb: instance.profile.supportsWeb ?? false,
      startedAt: instance.startedAt.toISOString(),
      lastActivity: instance.lastActivity?.toISOString(),
      error: instance.error,
    };

    const format: "markdown" | "json" = args.format ?? _defaultListFormat;
    if (format === "json") return JSON.stringify(data, null, 2);
    return [
      `# ${data.name} (${data.id})`,
      "",
      `- Status: ${data.status}`,
      `- Model: ${data.model}`,
      `- Port: ${data.port}`,
      `- Vision: ${data.supportsVision ? "yes" : "no"}`,
      `- Web: ${data.supportsWeb ? "yes" : "no"}`,
      "",
      `## Purpose`,
      data.purpose,
      "",
      `## When to use`,
      data.whenToUse,
      ...(data.error ? ["", `## Error`, String(data.error)] : []),
    ].join("\n");
  },
});

/**
 * Tool to spawn a new worker
 */
export const spawnNewWorker = tool({
  description: `Spawn a new worker with a specific profile. Built-in profiles: vision, docs, coder, architect, explorer.
You can also provide custom configuration to override defaults.`,
  args: {
    profileId: tool.schema.string().describe("Profile ID to use (built-in: vision, docs, coder, architect, explorer)"),
    model: tool.schema.string().optional().describe("Override the model to use"),
    customId: tool.schema.string().optional().describe("Custom ID for this worker instance"),
    showToast: tool.schema.boolean().optional().describe("Show a toast notification in the UI"),
  },
  async execute(args, ctx: ToolContext) {
    const baseProfile = getProfile(args.profileId, _profiles);
    if (!baseProfile) {
      const available = Object.keys(_profiles).sort().join(", ");
      return `Unknown profile "${args.profileId}". Available profiles: ${available || "(none)"}`;
    }

    let model = args.model ?? baseProfile.model;
    if (args.model) {
      const normalized = await normalizeModelInput(args.model);
      if (!normalized.ok) return `Failed to spawn worker: ${normalized.error}`;
      model = normalized.model;
    } else {
      model = await resolveAutoModel(baseProfile, ctx);
    }

    const profile = {
      ...baseProfile,
      id: args.customId ?? baseProfile.id,
      model,
    };

    try {
      if (args.showToast && _client) {
        void _client.tui
          .showToast({
          body: { message: `Spawning worker "${profile.name}"…`, variant: "info" },
          })
          .catch(() => {});
      }
      const instance = await spawnWorker(profile, {
        basePort: _spawnDefaults.basePort,
        timeout: _spawnDefaults.timeout,
        directory: _directory,
      });

      return `Worker "${profile.name}" (${profile.id}) spawned successfully on port ${instance.port}`;
    } catch (error) {
      return `Failed to spawn worker: ${error instanceof Error ? error.message : String(error)}`;
    }
  },
});

export const ensureWorkers = tool({
  description: "Ensure a set of workers are running (spawns any missing ones)",
  args: {
    profileIds: tool.schema.array(tool.schema.string()).describe("Worker profile IDs to ensure are running"),
  },
  async execute(args, ctx: ToolContext) {
    const uniqueIds = [...new Set(args.profileIds)];
    const toSpawn: WorkerProfile[] = [];
    for (const id of uniqueIds) {
      if (registry.getWorker(id)) continue;
      const profile = getProfile(id, _profiles);
      if (!profile) return `Unknown profile "${id}". Run list_profiles({}) to see available profiles.`;
      toSpawn.push({ ...profile, model: await resolveAutoModel(profile, ctx) });
    }

    if (toSpawn.length === 0) return "All requested workers are already running.";

    const { succeeded, failed } = await spawnWorkers(toSpawn, {
      basePort: _spawnDefaults.basePort,
      timeout: _spawnDefaults.timeout,
      directory: _directory,
    });

    const lines: string[] = [];
    if (succeeded.length > 0) lines.push(`Spawned: ${succeeded.map((w) => w.profile.id).join(", ")}`);
    if (failed.length > 0) {
      lines.push(
        `Failed: ${failed.map((f) => `${f.profile.id} (${f.error})`).join(", ")}`
      );
    }
    return lines.join("\n");
  },
});

/**
 * Tool to stop a worker
 */
export const stopWorkerTool = tool({
  description: "Stop and unregister a worker",
  args: {
    workerId: tool.schema.string().describe("ID of the worker to stop"),
  },
  async execute(args) {
    const success = await stopWorker(args.workerId);
    if (success) {
      return `Worker "${args.workerId}" stopped successfully`;
    }
    return `Failed to stop worker "${args.workerId}" - not found or already stopped`;
  },
});

export const delegateTask = tool({
  description:
    "Auto-route a task to the best worker (optionally auto-spawn), run it, and return the response.",
  args: {
    task: tool.schema.string().describe("Task description to delegate"),
    requiresVision: tool.schema.boolean().optional().describe("If true, prefer a vision-capable worker"),
    autoSpawn: tool.schema.boolean().optional().describe("If true, spawn a suitable worker if none exist"),
    workerId: tool.schema.string().optional().describe("Force a specific worker ID"),
    attachments: tool.schema
      .array(
        tool.schema.object({
          type: tool.schema.enum(["image", "file"]),
          path: tool.schema.string().optional(),
          base64: tool.schema.string().optional(),
          mimeType: tool.schema.string().optional(),
        })
      )
      .optional()
      .describe("Optional attachments to forward (e.g., images for vision tasks)"),
  },
  async execute(args, ctx: ToolContext) {
    const requiresVision = args.requiresVision ?? false;
    const autoSpawn = args.autoSpawn ?? true;

    let targetId = args.workerId;
    if (!targetId) {
      if (requiresVision) {
        const vision = registry.getVisionWorkers();
        targetId = vision[0]?.profile.id;
      } else {
        const matches = registry.getWorkersByCapability(args.task);
        targetId = matches[0]?.profile.id ?? registry.getActiveWorkers()[0]?.profile.id;
      }
    }

    if (!targetId && autoSpawn) {
      const guessProfile =
        requiresVision
          ? "vision"
          : /\b(doc|docs|documentation|reference|api|example|research|cite)\b/i.test(args.task)
            ? "docs"
            : /\b(architecture|design|plan|approach|tradeoff)\b/i.test(args.task)
              ? "architect"
              : "coder";

      const profile = getProfile(guessProfile, _profiles);
      if (!profile) return `No suitable profile found to spawn (wanted "${guessProfile}").`;
      const instance = await spawnWorker({ ...profile, model: await resolveAutoModel(profile, ctx) }, {
        basePort: _spawnDefaults.basePort,
        timeout: _spawnDefaults.timeout,
        directory: _directory,
      });
      targetId = instance.profile.id;
    }

    if (!targetId) {
      return "No workers available. Spawn one with spawn_worker({ profileId: 'coder' }) or run ensure_workers({ profileIds: [...] }).";
    }

    const result = await sendToWorker(targetId, args.task, { attachments: args.attachments });
    if (!result.success) return `Delegation failed (${targetId}): ${result.error}`;

    return [`# Delegated to ${targetId}`, "", result.response ?? ""].join("\n");
  },
});

/**
 * Tool to find the best worker for a task
 */
export const findWorker = tool({
  description: "Find the most suitable worker for a given task based on capabilities",
  args: {
    task: tool.schema.string().describe("Description of the task you need help with"),
    requiresVision: tool.schema.boolean().optional().describe("Whether the task requires image analysis"),
  },
  async execute(args) {
    const { task, requiresVision } = args;

    // If vision is required, filter to vision workers
    if (requiresVision) {
      const visionWorkers = registry.getVisionWorkers();
      if (visionWorkers.length === 0) {
        return "No vision-capable workers available. Spawn a vision worker first.";
      }
      const worker = visionWorkers[0];
      return JSON.stringify({
        recommendation: worker.profile.id,
        name: worker.profile.name,
        reason: "This worker supports vision and can analyze images",
        status: worker.status,
      });
    }

    // Otherwise, search by capability
    const matches = registry.getWorkersByCapability(task);
    if (matches.length === 0) {
      // Return all available workers
      const all = registry.getActiveWorkers();
      if (all.length === 0) {
        return "No workers available. Spawn workers first.";
      }
      return JSON.stringify({
        recommendation: all[0].profile.id,
        name: all[0].profile.name,
        reason: "No specific match found, using first available worker",
        allAvailable: all.map((w) => ({ id: w.profile.id, purpose: w.profile.purpose })),
      });
    }

    const best = matches[0];
    return JSON.stringify({
      recommendation: best.profile.id,
      name: best.profile.name,
      reason: best.profile.whenToUse,
      status: best.status,
      alternatives: matches.slice(1).map((w) => ({ id: w.profile.id, purpose: w.profile.purpose })),
    });
  },
});

import { workflowEngine } from "../core/workflow";
import { boomerangWorkflow } from "../workflows/boomerang";

export const runWorkflow = tool({
  description: "Run a predefined workflow. Currently supports 'roocode-boomerang'.",
  args: {
    workflowId: tool.schema.string().describe("ID of the workflow to run (e.g. 'roocode-boomerang')"),
    input: tool.schema.string().describe("Initial input for the workflow"),
    workerChain: tool.schema.array(tool.schema.string()).optional().describe("Optional override for worker chain (e.g. ['architect', 'coder', 'reviewer'])")
  },
  async execute(args) {
     const workflowId = args.workflowId;
     // Ensure default workflows are registered if not already
     if (workflowId === "roocode-boomerang" && !workflowEngine.getWorkflow(workflowId)) {
         workflowEngine.registerWorkflow(boomerangWorkflow);
     }

     try {
         const instance = await workflowEngine.startWorkflow(workflowId, args.input, { workerChain: args.workerChain });
         
         // Wait for completion (up to 2 minutes)
         return await new Promise<string>((resolve) => {
             const timeout = setTimeout(() => {
                 resolve(`Workflow started (ID: ${instance.id}). It is running in the background.`);
             }, 120000); 

             const onComplete = (data: { workflow: any; result: any }) => {
                 if (data.workflow.id === instance.id) {
                     cleanup();
                     resolve(`Workflow completed:\n${data.result}`);
                 }
             };

             const onFail = (data: { workflow: any; error: any }) => {
                 if (data.workflow.id === instance.id) {
                     cleanup();
                     resolve(`Workflow failed: ${data.error}`);
                 }
             };

             const cleanup = () => {
                 clearTimeout(timeout);
                 workflowEngine.off("workflow:completed", onComplete);
                 workflowEngine.off("workflow:failed", onFail);
             };

             workflowEngine.on("workflow:completed", onComplete);
             workflowEngine.on("workflow:failed", onFail);
         });

     } catch (e) {
         return `Failed to start workflow: ${e instanceof Error ? e.message : String(e)}`;
     }
  }
});

/**
 * All tools exported for the plugin
 */
export const orchestratorTools = {
  list_models: listModels,
  list_profiles: listProfiles,
  list_workers: listWorkers,
  orchestrator_config: orchestratorConfig,
  autofill_profile_models: autofillProfileModels,
  set_profile_model: setProfileModel,
  set_autospawn: setAutoSpawn,
  set_orchestrator_agent: setOrchestratorAgent,
  memory_put: memoryPut,
  memory_link: memoryLink,
  memory_search: memorySearchTool,
  memory_recent: memoryRecentTool,
  orchestrator_help: orchestratorHelp,
  ask_worker: askWorker,
  get_worker_info: getWorkerInfo,
  spawn_worker: spawnNewWorker,
  ensure_workers: ensureWorkers,
  delegate_task: delegateTask,
  stop_worker: stopWorkerTool,
  find_worker: findWorker,
  run_workflow: runWorkflow,
};
