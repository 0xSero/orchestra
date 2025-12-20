/**
 * Orchestrator tools (factory)
 *
 * IMPORTANT:
 * - No module-level mutable state.
 * - All tools close over an explicit OrchestratorRuntime instance.
 */

import { tool } from "@opencode-ai/plugin";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { loadOrchestratorConfig, getDefaultGlobalOrchestratorConfigPath, getDefaultProjectOrchestratorConfigPath } from "../config/orchestrator";
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
import { sendToWorker, spawnWorker, spawnWorkers, stopWorker } from "../workers/spawner";
import type { OrchestratorRuntime } from "../core/runtime";
import type { WorkflowRunResult } from "../workflows";

type ToolContext = {
  agent?: string;
  sessionID?: string;
  messageID?: string;
};

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

function renderMarkdownTable(headers: string[], rows: string[][]): string {
  const esc = (s: string) => s.replace(/\|/g, "\\|");
  const head = `| ${headers.join(" | ")} |`;
  const sep = `| ${headers.map(() => "---").join(" | ")} |`;
  const body = rows
    .map((r) => `| ${r.map((c) => esc(c.replace(/\n/g, " "))).join(" | ")} |`)
    .join("\n");
  return [head, sep, body].filter(Boolean).join("\n");
}

function looksLikeSecret(text: string): boolean {
  const t = text.trim();
  if (t.length < 12) return false;
  // Common high-risk patterns (conservative).
  if (/-----BEGIN [A-Z ]+PRIVATE KEY-----/.test(t)) return true;
  if (/\bAKIA[0-9A-Z]{16}\b/.test(t)) return true; // AWS access key id
  if (/\bASIA[0-9A-Z]{16}\b/.test(t)) return true; // AWS temp key id
  if (/\bsk-[A-Za-z0-9]{20,}\b/.test(t)) return true; // OpenAI-ish
  if (/\bxox[baprs]-[A-Za-z0-9-]{10,}\b/.test(t)) return true; // Slack token-ish
  if (/\bghp_[A-Za-z0-9]{20,}\b/.test(t)) return true; // GitHub PAT-ish
  if (/Bearer\s+[A-Za-z0-9._-]{20,}/i.test(t)) return true;
  // High-entropy fallback: long single token-like strings.
  if (/^[A-Za-z0-9+/=._-]{40,}$/.test(t) && !/\s/.test(t)) return true;
  return false;
}

async function getLastUsedModelFromSession(runtime: OrchestratorRuntime, ctx?: ToolContext): Promise<string | undefined> {
  if (!ctx?.sessionID) return undefined;
  const res = await runtime.client.session
    .messages({ path: { id: ctx.sessionID }, query: { directory: runtime.directory, limit: 25 } })
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

async function getFallbackModel(runtime: OrchestratorRuntime, ctx?: ToolContext): Promise<string> {
  const lastUsed = await getLastUsedModelFromSession(runtime, ctx);
  if (lastUsed) return lastUsed;
  const cfg = await fetchOpencodeConfig(runtime.client, runtime.directory).catch(() => undefined);
  if (cfg?.model) return cfg.model;
  return "opencode/gpt-5-nano";
}

async function resolveAutoModel(runtime: OrchestratorRuntime, profile: WorkerProfile, ctx?: ToolContext): Promise<string> {
  if (!profile.model.startsWith("auto")) return profile.model;

  const fallback = await getFallbackModel(runtime, ctx);
  const { providers } = await fetchProviders(runtime.client, runtime.directory);
  const catalog = flattenProviders(filterProviders(providers, "configured"));

  const tag = profile.model;
  const isVision = profile.supportsVision || /auto:vision/i.test(tag);
  const isDocs = /auto:docs/i.test(tag);
  const isFast = /auto:fast/i.test(tag);

  const picked = isVision ? pickVisionModel(catalog) : isDocs ? pickDocsModel(catalog) : isFast ? pickFastModel(catalog) : undefined;
  return picked?.full ?? fallback;
}

async function normalizeModelInput(
  runtime: OrchestratorRuntime,
  model: string
): Promise<{ ok: true; model: string } | { ok: false; error: string }> {
  const { providers } = await fetchProviders(runtime.client, runtime.directory);
  const resolved = resolveModelRef(model, providers);
  if ("error" in resolved) {
    const suffix = resolved.suggestions?.length ? `\nSuggestions:\n- ${resolved.suggestions.join("\n- ")}` : "";
    return { ok: false, error: resolved.error + suffix };
  }
  return { ok: true, model: resolved.full };
}

function configPathForScope(runtime: OrchestratorRuntime, scope: "global" | "project"): string {
  if (scope === "global") return getDefaultGlobalOrchestratorConfigPath();
  return getDefaultProjectOrchestratorConfigPath(runtime.directory);
}

export function createOrchestratorTools(runtime: OrchestratorRuntime) {
  /**
   * Tool to list all available workers and their status
   */
  const listWorkers = tool({
    description: "List all available workers in the orchestrator registry with their status and capabilities",
    args: {
      format: tool.schema.enum(["markdown", "json"]).optional().describe("Output format (default: markdown)"),
    },
    async execute(args) {
      const workers = runtime.registry.toJSON() as Array<Record<string, any>>;
      if (workers.length === 0) {
        return "No workers are currently registered. Use spawn_worker to create workers.";
      }

      const format: "markdown" | "json" = args.format ?? runtime.uiDefaults.defaultListFormat;
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
  const listProfiles = tool({
    description:
      "List all available worker profiles that can be spawned (built-in + any custom profiles loaded from orchestrator.json)",
    args: {
      format: tool.schema.enum(["markdown", "json"]).optional().describe("Output format (default: markdown)"),
    },
    async execute(args) {
      const profiles = Object.values(runtime.profiles)
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

      const format: "markdown" | "json" = args.format ?? runtime.uiDefaults.defaultListFormat;
      const rows = profiles.map((p) => [p.id, p.name, p.model, p.supportsVision ? "yes" : "no", p.supportsWeb ? "yes" : "no", p.purpose]);
      return format === "json"
        ? JSON.stringify(profiles, null, 2)
        : renderMarkdownTable(["ID", "Name", "Model", "Vision", "Web", "Purpose"], rows);
    },
  });

  const listModels = tool({
    description:
      "List models available in your current OpenCode configuration (via the SDK). Use this to pick valid provider/model IDs for profiles.",
    args: {
      scope: tool.schema.enum(["configured", "all"]).optional().describe("Which providers to include (default: configured)"),
      query: tool.schema.string().optional().describe("Filter by substring"),
      limit: tool.schema.number().optional().describe("Max results (default: 40)"),
      format: tool.schema.enum(["markdown", "json"]).optional().describe("Output format (default: markdown)"),
    },
    async execute(args) {
      const { providers } = await fetchProviders(runtime.client, runtime.directory);
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

      const format: "markdown" | "json" = args.format ?? runtime.uiDefaults.defaultListFormat;
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

  const autofillProfileModels = tool({
    description:
      "Populate worker profile models using your current OpenCode model (last used) and configured providers. Great for first-time setup.",
    args: {
      scope: tool.schema.enum(["global", "project"]).describe("Where to write config"),
      profileIds: tool.schema.array(tool.schema.string()).optional().describe("Which profile IDs to update (default: built-in profiles)"),
      setAgent: tool.schema.boolean().optional().describe("Also set orchestrator agent model to the current model (default: true)"),
      force: tool.schema.boolean().optional().describe("Override existing saved models (default: false)"),
      showToast: tool.schema.boolean().optional().describe("Show a toast with what changed (default: true)"),
    },
    async execute(args, ctx: ToolContext) {
      const force = args.force ?? false;
      const setAgent = args.setAgent ?? true;
      const showToast = args.showToast ?? true;

      const currentModel = await getFallbackModel(runtime, ctx);
      const { providers } = await fetchProviders(runtime.client, runtime.directory);
      const catalog = flattenProviders(filterProviders(providers, "configured"));

      const ids = args.profileIds?.length ? [...new Set(args.profileIds)] : Object.keys(builtInProfiles);
      const path = configPathForScope(runtime, args.scope);
      const existing = await readConfigFile(path);

      const changed: Array<{ id: string; from: string; to: string }> = [];
      let next: OrchestratorConfigFile = existing;

      for (const id of ids) {
        const base = getProfile(id, runtime.profiles) ?? builtInProfiles[id];
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
        runtime.profiles[id] = { ...base, model: desired };
        if (prior !== desired) changed.push({ id, from: prior, to: desired });
      }

      if (setAgent) {
        const existingAgent = isPlainObject(existing.agent) ? (existing.agent as any) : {};
        if (force || typeof existingAgent.model !== "string") {
          next = { ...next, agent: { ...existingAgent, model: currentModel } };
        }
      }

      await writeConfigFile(path, next);

      if (showToast) {
        const msg = changed.length === 0 ? "No profile models changed." : `Updated models for: ${changed.map((c) => c.id).join(", ")}`;
        await runtime.showToast(msg, changed.length ? "success" : "info");
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

  const orchestratorConfig = tool({
    description: "Show the effective orchestrator configuration (merged global + project) and worker→model mapping",
    args: {
      format: tool.schema.enum(["markdown", "json"]).optional().describe("Output format (default: markdown)"),
    },
    async execute(args) {
      const format = args.format ?? runtime.uiDefaults.defaultListFormat;
      const { config, sources } = await loadOrchestratorConfig({ directory: runtime.directory, worktree: runtime.worktree });

      // Show the hydrated (runtime) view, not just the raw file values.
      try {
        const hydrated = await hydrateProfileModelsFromOpencode({
          client: runtime.client,
          directory: runtime.directory,
          profiles: config.profiles,
        });
        config.profiles = hydrated.profiles;
      } catch {
        // ignore
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

  const setProfileModel = tool({
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
      const normalized = await normalizeModelInput(runtime, args.model);
      if (!normalized.ok) return normalized.error;

      const base = runtime.profiles[args.profileId] ?? builtInProfiles[args.profileId];
      if (!base) {
        if (!args.name || !args.purpose || !args.whenToUse) {
          return [
            `Profile "${args.profileId}" is not a built-in profile.`,
            "To create a new custom profile via this tool, you must provide: name, purpose, whenToUse.",
            "Alternatively, edit orchestrator.json manually and add a full profile object.",
          ].join("\n");
        }
      }

      const path = configPathForScope(runtime, args.scope);
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

      runtime.profiles[args.profileId] = {
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

  const setAutoSpawn = tool({
    description: "Configure which workers auto-spawn on startup (writes to orchestrator.json)",
    args: {
      scope: tool.schema.enum(["global", "project"]).describe("Where to write config"),
      autoSpawn: tool.schema.boolean().describe("Enable/disable auto-spawn"),
      workers: tool.schema.array(tool.schema.string()).describe("Profile IDs to auto-spawn"),
    },
    async execute(args) {
      const path = configPathForScope(runtime, args.scope);
      const existing = await readConfigFile(path);
      const next: OrchestratorConfigFile = setSpawnList({ ...existing, autoSpawn: args.autoSpawn }, args.workers);
      await writeConfigFile(path, next);
      return `Saved auto-spawn config in ${args.scope} file: ${path}`;
    },
  });

  const setOrchestratorAgent = tool({
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
      const path = configPathForScope(runtime, args.scope);
      const existing = await readConfigFile(path);
      let model = args.model;
      if (typeof model === "string") {
        const normalized = await normalizeModelInput(runtime, model);
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

  const orchestratorHelp = tool({
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

  const askWorker = tool({
    description:
      "Send a message to a specialized worker and get a response. Use this to delegate tasks to workers with specific capabilities.",
    args: {
      workerId: tool.schema.string().describe("ID of the worker to message (e.g., 'vision', 'docs', 'coder')"),
      message: tool.schema.string().describe("The message/question to send to the worker"),
      imageBase64: tool.schema.string().optional().describe("Optional base64-encoded image to send (deprecated; use attachments)"),
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

      const result = await sendToWorker(workerId, message, { attachments: attachments as any, registry: runtime.registry });
      if (!result.success) return `Error communicating with worker "${workerId}": ${result.error}`;
      return result.response ?? "Worker returned empty response";
    },
  });

  const getWorkerInfo = tool({
    description: "Get detailed information about a specific worker including its purpose, model, and current status",
    args: {
      workerId: tool.schema.string().describe("ID of the worker to get info about"),
      format: tool.schema.enum(["markdown", "json"]).optional().describe("Output format (default: markdown)"),
    },
    async execute(args) {
      const instance = runtime.registry.getWorker(args.workerId);
      if (!instance) return `Worker "${args.workerId}" not found. Use list_workers to see available workers.`;

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

      const format: "markdown" | "json" = args.format ?? runtime.uiDefaults.defaultListFormat;
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

  const spawnNewWorker = tool({
    description: "Spawn a new worker with a specific profile.",
    args: {
      profileId: tool.schema.string().describe("Profile ID to use"),
      model: tool.schema.string().optional().describe("Override the model to use"),
      customId: tool.schema.string().optional().describe("Custom ID for this worker instance"),
      showToast: tool.schema.boolean().optional().describe("Show a toast notification in the UI"),
    },
    async execute(args, ctx: ToolContext) {
      const baseProfile = getProfile(args.profileId, runtime.profiles);
      if (!baseProfile) {
        const available = Object.keys(runtime.profiles).sort().join(", ");
        return `Unknown profile "${args.profileId}". Available profiles: ${available || "(none)"}`;
      }

      let model = args.model ?? baseProfile.model;
      if (args.model) {
        const normalized = await normalizeModelInput(runtime, args.model);
        if (!normalized.ok) return `Failed to spawn worker: ${normalized.error}`;
        model = normalized.model;
      } else {
        model = await resolveAutoModel(runtime, baseProfile, ctx);
      }

      const profile = {
        ...baseProfile,
        id: args.customId ?? baseProfile.id,
        model,
      };

      try {
        if (args.showToast) await runtime.showToast(`Spawning worker "${profile.name}"…`, "info");
        const instance = await spawnWorker(profile, {
          basePort: runtime.spawnDefaults.basePort,
          timeout: runtime.spawnDefaults.timeout,
          directory: runtime.directory,
          registry: runtime.registry,
        });
        return `Worker "${profile.name}" (${profile.id}) spawned successfully on port ${instance.port}`;
      } catch (error) {
        return `Failed to spawn worker: ${error instanceof Error ? error.message : String(error)}`;
      }
    },
  });

  const ensureWorkers = tool({
    description: "Ensure a set of workers are running (spawns any missing ones)",
    args: {
      profileIds: tool.schema.array(tool.schema.string()).describe("Worker profile IDs to ensure are running"),
    },
    async execute(args, ctx: ToolContext) {
      const uniqueIds = [...new Set(args.profileIds)];
      const toSpawn: WorkerProfile[] = [];
      for (const id of uniqueIds) {
        if (runtime.registry.getWorker(id)) continue;
        const profile = getProfile(id, runtime.profiles);
        if (!profile) return `Unknown profile "${id}". Run list_profiles({}) to see available profiles.`;
        toSpawn.push({ ...profile, model: await resolveAutoModel(runtime, profile, ctx) });
      }

      if (toSpawn.length === 0) return "All requested workers are already running.";

      const { succeeded, failed } = await spawnWorkers(toSpawn, {
        basePort: runtime.spawnDefaults.basePort,
        timeout: runtime.spawnDefaults.timeout,
        directory: runtime.directory,
        registry: runtime.registry,
      });

      const lines: string[] = [];
      if (succeeded.length > 0) lines.push(`Spawned: ${succeeded.map((w) => w.profile.id).join(", ")}`);
      if (failed.length > 0) lines.push(`Failed: ${failed.map((f) => `${f.profile.id} (${f.error})`).join(", ")}`);
      return lines.join("\n");
    },
  });

  const stopWorkerTool = tool({
    description: "Stop and unregister a worker",
    args: {
      workerId: tool.schema.string().describe("ID of the worker to stop"),
    },
    async execute(args) {
      const success = await stopWorker(args.workerId, { registry: runtime.registry });
      if (success) return `Worker "${args.workerId}" stopped successfully`;
      return `Failed to stop worker "${args.workerId}" - not found or already stopped`;
    },
  });

  const delegateTask = tool({
    description: "Auto-route a task to the best worker (optionally auto-spawn), run it, and return the response.",
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
        .describe("Optional attachments to forward"),
    },
    async execute(args, ctx: ToolContext) {
      const requiresVision = args.requiresVision ?? false;
      const autoSpawn = args.autoSpawn ?? true;

      let targetId = args.workerId;
      if (!targetId) {
        if (requiresVision) {
          const vision = runtime.registry.getVisionWorkers();
          targetId = vision[0]?.profile.id;
        } else {
          const matches = runtime.registry.getWorkersByCapability(args.task);
          targetId = matches[0]?.profile.id ?? runtime.registry.getActiveWorkers()[0]?.profile.id;
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

        const profile = getProfile(guessProfile, runtime.profiles);
        if (!profile) return `No suitable profile found to spawn (wanted "${guessProfile}").`;
        const instance = await spawnWorker(
          { ...profile, model: await resolveAutoModel(runtime, profile, ctx) },
          { basePort: runtime.spawnDefaults.basePort, timeout: runtime.spawnDefaults.timeout, directory: runtime.directory, registry: runtime.registry }
        );
        targetId = instance.profile.id;
      }

      if (!targetId) {
        return "No workers available. Spawn one with spawn_worker({ profileId: 'coder' }) or run ensure_workers({ profileIds: [...] }).";
      }

      const result = await sendToWorker(targetId, args.task, { attachments: args.attachments as any, registry: runtime.registry });
      if (!result.success) return `Delegation failed (${targetId}): ${result.error}`;

      return [`# Delegated to ${targetId}`, "", result.response ?? ""].join("\n");
    },
  });

  const findWorker = tool({
    description: "Find the most suitable worker for a given task based on capabilities",
    args: {
      task: tool.schema.string().describe("Description of the task you need help with"),
      requiresVision: tool.schema.boolean().optional().describe("Whether the task requires image analysis"),
    },
    async execute(args) {
      const { task, requiresVision } = args;
      if (requiresVision) {
        const visionWorkers = runtime.registry.getVisionWorkers();
        if (visionWorkers.length === 0) return "No vision-capable workers available. Spawn a vision worker first.";
        const worker = visionWorkers[0];
        return JSON.stringify({
          recommendation: worker.profile.id,
          name: worker.profile.name,
          reason: "This worker supports vision and can analyze images",
          status: worker.status,
        });
      }

      const matches = runtime.registry.getWorkersByCapability(task);
      if (matches.length === 0) {
        const all = runtime.registry.getActiveWorkers();
        if (all.length === 0) return "No workers available. Spawn workers first.";
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

  // --- Workflows ---
  const listWorkflows = tool({
    description: "List available orchestrator workflows (built-in).",
    args: {
      format: tool.schema.enum(["markdown", "json"]).optional().describe("Output format (default: markdown)"),
    },
    async execute(args) {
      const workflows = runtime.workflows.list();
      const format: "markdown" | "json" = args.format ?? runtime.uiDefaults.defaultListFormat;
      if (format === "json") return JSON.stringify(workflows, null, 2);
      const rows = workflows.map((w) => [w.id, w.name, w.requiredWorkers.join(", "), w.description]);
      return renderMarkdownTable(["ID", "Name", "Required Workers", "Description"], rows);
    },
  });

  const runWorkflow = tool({
    description:
      "Run a workflow (multi-step, sequential). This can spawn required workers and returns a consolidated report.",
    args: {
      workflowId: tool.schema.string().describe("Workflow ID (use list_workflows to discover)"),
      task: tool.schema.string().describe("Task to run through the workflow"),
      autoSpawn: tool.schema.boolean().optional().describe("Auto-spawn missing workers (default: true)"),
      format: tool.schema.enum(["markdown", "json"]).optional().describe("Output format (default: markdown)"),
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
        .describe("Optional attachments forwarded to each step"),
    },
    async execute(args) {
      const result = await runtime.workflows.run({
        workflowId: args.workflowId,
        task: args.task,
        autoSpawn: args.autoSpawn ?? true,
        attachments: args.attachments as any,
      });

      const format: "markdown" | "json" = args.format ?? runtime.uiDefaults.defaultListFormat;
      if (format === "json") return JSON.stringify(result satisfies WorkflowRunResult, null, 2);
      return result.output;
    },
  });

  // --- Memory tools (unchanged behavior, but use runtime directory/projectId) ---
  const memoryPut = tool({
    description:
      "Upsert a memory entry into Neo4j (requires env: OPENCODE_NEO4J_URI/USERNAME/PASSWORD). Stores to global or per-project graph.",
    args: {
      scope: tool.schema.enum(["project", "global"]).optional().describe("Memory scope (default: project)"),
      key: tool.schema.string().describe("Stable key"),
      value: tool.schema.string().describe("Memory content (concise, no secrets)"),
      tags: tool.schema.array(tool.schema.string()).optional().describe("Optional tags"),
    },
    async execute(args) {
      const cfg = loadNeo4jConfigFromEnv();
      if (!cfg) {
        return "Neo4j is not configured. Set env vars: OPENCODE_NEO4J_URI, OPENCODE_NEO4J_USERNAME, OPENCODE_NEO4J_PASSWORD (and optional OPENCODE_NEO4J_DATABASE).";
      }

      if (looksLikeSecret(args.value)) {
        return [
          "Refusing to store this memory value because it looks like a secret/token/key.",
          "Store a redacted summary instead (no credentials), or store a reference like: `secret:stored-in-1password`.",
        ].join("\n");
      }

      const scope: MemoryScope = args.scope ?? "project";
      const projectId = scope === "project" ? runtime.projectId : undefined;
      if (scope === "project" && !projectId) return "Missing projectId; restart OpenCode.";

      const node = await upsertMemory({
        cfg,
        scope,
        projectId,
        key: args.key,
        value: args.value,
        tags: args.tags ?? [],
      });

      await runtime.showToast(`Saved memory: ${node.key} (${node.scope})`, "success");
      return JSON.stringify(node, null, 2);
    },
  });

  const memoryLink = tool({
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
      const projectId = scope === "project" ? runtime.projectId : undefined;
      if (scope === "project" && !projectId) return "Missing projectId; restart OpenCode.";
      await linkMemory({ cfg, scope, projectId, fromKey: args.fromKey, toKey: args.toKey, type: args.type });
      return `Linked ${args.fromKey} -> ${args.toKey}`;
    },
  });

  const memorySearchTool = tool({
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
      const projectId = scope === "project" ? runtime.projectId : undefined;
      if (scope === "project" && !projectId) return "Missing projectId; restart OpenCode.";
      const results = await searchMemory({ cfg, scope, projectId, query: args.query, limit: args.limit ?? 10 });
      const format = args.format ?? runtime.uiDefaults.defaultListFormat;
      if (format === "json") return JSON.stringify(results, null, 2);
      if (results.length === 0) return "No matches.";
      return results.map((r) => `- \`${r.key}\` (${r.scope})${r.tags.length ? ` [${r.tags.join(", ")}]` : ""}\n  - ${r.value}`).join("\n");
    },
  });

  const memoryRecentTool = tool({
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
      const projectId = scope === "project" ? runtime.projectId : undefined;
      if (scope === "project" && !projectId) return "Missing projectId; restart OpenCode.";
      const results = await recentMemory({ cfg, scope, projectId, limit: args.limit ?? 10 });
      const format = args.format ?? runtime.uiDefaults.defaultListFormat;
      if (format === "json") return JSON.stringify(results, null, 2);
      if (results.length === 0) return "No memory entries.";
      return results.map((r) => `- \`${r.key}\` (${r.scope}) - ${r.value}`).join("\n");
    },
  });

  return {
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
    list_workflows: listWorkflows,
    run_workflow: runWorkflow,
  };
}

