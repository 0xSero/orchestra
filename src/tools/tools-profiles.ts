import { tool } from "@opencode-ai/plugin";
import { loadOrchestratorConfig } from "../config/orchestrator";
import { builtInProfiles } from "../config/profiles";
import type { OrchestratorConfigFile, WorkerProfile } from "../types";
import { fetchProviders, filterProviders, flattenProviders } from "../models/catalog";
import { hydrateProfileModelsFromOpencode } from "../models/hydrate";
import { renderMarkdownTable } from "./markdown";
import { configPathForScope, readOrchestratorConfigFile, setSpawnList, upsertProfileEntry, writeOrchestratorConfigFile } from "./config-store";
import { normalizeModelInput } from "./normalize-model";
import { getClient, getDefaultListFormat, getDirectory, getProfiles, getWorktree } from "./state";

export const listProfiles = tool({
  description:
    "List all available worker profiles that can be spawned (built-in + any custom profiles loaded from orchestrator.json)",
  args: {
    format: tool.schema.enum(["markdown", "json"]).optional().describe("Output format (default: markdown)"),
  },
  async execute(args) {
    const profiles = Object.values(getProfiles())
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

    const format: "markdown" | "json" = args.format ?? getDefaultListFormat();
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
      .describe("Which providers to include (default: configured = explicitly configured in opencode.json)"),
    providers: tool.schema
      .array(tool.schema.string())
      .optional()
      .describe("Explicit list of provider IDs to include (overrides scope). E.g. ['homelabai', 'local-proxy']"),
    query: tool.schema.string().optional().describe("Filter by substring (matches provider, model id, name, or full id)"),
    limit: tool.schema.number().optional().describe("Max results (default: 100)"),
    format: tool.schema.enum(["markdown", "json"]).optional().describe("Output format (default: markdown)"),
  },
  async execute(args) {
    const client = getClient();
    if (!client) return "OpenCode client not available; restart OpenCode.";

    const { providers } = await fetchProviders(client, getDirectory());

    let scoped: typeof providers;
    if (args.providers && args.providers.length > 0) {
      const allowSet = new Set(args.providers.map((p) => p.toLowerCase()));
      scoped = providers.filter((p) => allowSet.has(p.id.toLowerCase()));
    } else {
      scoped = filterProviders(providers, args.scope ?? "configured");
    }

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
    const limited = models.slice(0, Math.max(1, args.limit ?? 100));

    const format: "markdown" | "json" = args.format ?? getDefaultListFormat();
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
    "Pin worker profile models to concrete provider/model IDs based on your OpenCode config (useful for deterministic setups).",
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
  async execute(args) {
    const client = getClient();
    if (!client) return "OpenCode client not available; restart OpenCode.";

    const scope = args.scope;
    const force = args.force ?? false;
    const setAgent = args.setAgent ?? true;
    const showToast = args.showToast ?? true;

    const all = getProfiles();
    const wantedIds = args.profileIds?.length ? args.profileIds : Object.keys(builtInProfiles);
    const selected: Record<string, WorkerProfile> = {};
    for (const id of wantedIds) {
      const p = all[id];
      if (p) selected[id] = p;
    }
    if (Object.keys(selected).length === 0) {
      return `No matching profiles. Available: ${Object.keys(all).sort().join(", ") || "(none)"}`;
    }

    const path = configPathForScope(scope, getDirectory());
    const existing = await readOrchestratorConfigFile(path);

    const hasSavedModel = (cfg: OrchestratorConfigFile, id: string): boolean => {
      if (!Array.isArray(cfg.profiles)) return false;
      return cfg.profiles.some((p: any) => p && typeof p === "object" && (p as any).id === id && typeof (p as any).model === "string");
    };

    const hydrated = await hydrateProfileModelsFromOpencode({ client, directory: getDirectory(), profiles: selected });

    let next: OrchestratorConfigFile = existing;
    const applied: Array<{ id: string; from: string; to: string; reason: string }> = [];

    for (const [id, resolved] of Object.entries(hydrated.profiles)) {
      if (!force && hasSavedModel(existing, id)) continue;
      next = upsertProfileEntry(next, id, { model: resolved.model });
      applied.push({
        id,
        from: selected[id]?.model ?? "",
        to: resolved.model,
        reason: hydrated.changes.find((c) => c.profileId === id)?.reason ?? "resolved",
      });
      all[id] = { ...(all[id] ?? resolved), model: resolved.model, id };
    }

    if (setAgent && hydrated.fallbackModel) {
      next = { ...next, agent: { ...(next.agent ?? {}), model: hydrated.fallbackModel } };
    }

    await writeOrchestratorConfigFile(path, next);

    if (showToast) {
      const summary = applied.length > 0 ? `Pinned ${applied.length} profile model(s)` : "No changes";
      void client.tui.showToast({ body: { message: summary, variant: applied.length > 0 ? "success" : "info" } }).catch(() => {});
    }

    if (applied.length === 0) {
      return [
        "No changes applied.",
        `- file: ${path}`,
        `- hint: pass { force: true } to overwrite existing pinned models`,
      ].join("\n");
    }

    const lines: string[] = [];
    lines.push(`Pinned ${applied.length} profile model(s) in ${scope} config:`);
    lines.push(`- file: ${path}`);
    for (const c of applied.sort((a, b) => a.id.localeCompare(b.id))) {
      lines.push(`- ${c.id}: ${c.to}`);
    }
    if (setAgent && hydrated.fallbackModel) lines.push(`- agent.model: ${hydrated.fallbackModel}`);
    return lines.join("\n");
  },
});

export const orchestratorConfig = tool({
  description: "Show the effective orchestrator configuration (merged global + project) and worker→model mapping",
  args: {
    format: tool.schema.enum(["markdown", "json"]).optional().describe("Output format (default: markdown)"),
  },
  async execute(args) {
    const format = args.format ?? getDefaultListFormat();
    const { config, sources } = await loadOrchestratorConfig({ directory: getDirectory(), worktree: getWorktree() });

    const effectiveProfiles = getProfiles();

    const profileRows = Object.values(effectiveProfiles)
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
          workflows: config.workflows,
          security: config.security,
          profiles: Object.values(effectiveProfiles).map((p) => ({ id: p.id, name: p.name, model: p.model })),
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
      `- workflows: ${config.workflows?.enabled === false ? "disabled" : "enabled"}`,
      `- memory: ${config.memory?.enabled === false ? "disabled" : "enabled"}`,
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
    const client = getClient();
    const normalized = await normalizeModelInput(args.model, { client, directory: getDirectory() });
    if (!normalized.ok) return normalized.error;
    const toPersist = args.model.includes("/") ? args.model.trim() : normalized.model;

    const profiles = getProfiles();
    const base = profiles[args.profileId] ?? builtInProfiles[args.profileId];
    if (!base) {
      if (!args.name || !args.purpose || !args.whenToUse) {
        return [
          `Profile "${args.profileId}" is not a built-in profile.`,
          "To create a new custom profile via this tool, you must provide: name, purpose, whenToUse.",
          "Alternatively, edit orchestrator.json manually and add a full profile object.",
        ].join("\n");
      }
    }

    const path = configPathForScope(args.scope, getDirectory());
    const existing = await readOrchestratorConfigFile(path);
    const next = upsertProfileEntry(existing, args.profileId, {
      model: toPersist,
      ...(args.name ? { name: args.name } : {}),
      ...(args.purpose ? { purpose: args.purpose } : {}),
      ...(args.whenToUse ? { whenToUse: args.whenToUse } : {}),
      ...(args.systemPrompt ? { systemPrompt: args.systemPrompt } : {}),
      ...(typeof args.temperature === "number" ? { temperature: args.temperature } : {}),
      ...(typeof args.supportsVision === "boolean" ? { supportsVision: args.supportsVision } : {}),
      ...(typeof args.supportsWeb === "boolean" ? { supportsWeb: args.supportsWeb } : {}),
      ...(args.tags ? { tags: args.tags } : {}),
    });
    await writeOrchestratorConfigFile(path, next);

    profiles[args.profileId] = {
      ...(base ?? ({} as WorkerProfile)),
      ...(args.name ? { name: args.name } : {}),
      ...(args.purpose ? { purpose: args.purpose } : {}),
      ...(args.whenToUse ? { whenToUse: args.whenToUse } : {}),
      ...(args.systemPrompt ? { systemPrompt: args.systemPrompt } : {}),
      ...(typeof args.temperature === "number" ? { temperature: args.temperature } : {}),
      ...(typeof args.supportsVision === "boolean" ? { supportsVision: args.supportsVision } : {}),
      ...(typeof args.supportsWeb === "boolean" ? { supportsWeb: args.supportsWeb } : {}),
      ...(args.tags ? { tags: args.tags } : {}),
      model: toPersist,
      id: args.profileId,
    };

    return [
      `Saved profile override for "${args.profileId}" in ${args.scope} config:`,
      `- file: ${path}`,
      `- model: ${toPersist}`,
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
    const path = configPathForScope(args.scope, getDirectory());
    const existing = await readOrchestratorConfigFile(path);
    const next: OrchestratorConfigFile = setSpawnList({ ...existing, autoSpawn: args.autoSpawn }, args.workers);
    await writeOrchestratorConfigFile(path, next);
    return `Saved auto-spawn config in ${args.scope} file: ${path}`;
  },
});

export const resetProfileModels = tool({
  description:
    "Reset saved profile→model overrides so workers go back to default `node:*` selection (writes to orchestrator.json).",
  args: {
    scope: tool.schema.enum(["global", "project"]).describe("Where to write config"),
    profileIds: tool.schema
      .array(tool.schema.string())
      .optional()
      .describe("Which profile IDs to reset (default: all built-in profiles)"),
  },
  async execute(args) {
    const path = configPathForScope(args.scope, getDirectory());
    const existing = await readOrchestratorConfigFile(path);
    const ids = args.profileIds?.length ? new Set(args.profileIds) : new Set(Object.keys(builtInProfiles));

    const nextProfiles = Array.isArray(existing.profiles)
      ? existing.profiles.filter((p: any) => {
          if (typeof p === "string") return !ids.has(p);
          if (p && typeof p === "object" && typeof (p as any).id === "string") return !ids.has((p as any).id);
          return true;
        })
      : [];

    const next: OrchestratorConfigFile = { ...existing, profiles: nextProfiles };
    await writeOrchestratorConfigFile(path, next);

    const profiles = getProfiles();
    for (const id of ids) {
      const base = builtInProfiles[id];
      if (base) profiles[id] = base;
    }

    return [
      `Reset profile model overrides in ${args.scope} config:`,
      `- file: ${path}`,
      `- profiles reset: ${[...ids].sort().join(", ")}`,
      "",
      "Tip: run `autofill_profile_models({ scope: 'global' })` to pin the last-used model again.",
    ].join("\n");
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
    const path = configPathForScope(args.scope, getDirectory());
    const existing = await readOrchestratorConfigFile(path);
    let model = args.model;
    if (typeof model === "string") {
      const normalized = await normalizeModelInput(model, { client: getClient(), directory: getDirectory() });
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
    await writeOrchestratorConfigFile(path, next);
    return `Saved agent config in ${args.scope} file: ${path}`;
  },
});
