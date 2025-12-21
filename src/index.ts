import type { Plugin } from "@opencode-ai/plugin";
import { loadOrchestratorConfig } from "./config/orchestrator";
import { registry } from "./core/registry";
import {
  coreOrchestratorTools,
  setClient,
  setDirectory,
  setProfiles,
  setProjectId,
  setSecurityConfig,
  setSpawnDefaults,
  setUiDefaults,
  setWorkflowConfig,
  setWorktree,
} from "./tools";
import { spawnWorkers, stopWorker } from "./workers/spawner";
import type { WorkerInstance } from "./types";
import type { Config } from "@opencode-ai/sdk";
import { createIdleNotifier } from "./ux/idle-notification";
import { createPruningTransform } from "./ux/pruning";

import { resolveModelRef } from "./models/catalog";
import { ensureRuntime, shutdownAllWorkers } from "./core/runtime";
import { removeSessionEntry, upsertSessionEntry } from "./core/device-registry";
import { setLoggerConfig } from "./core/logger";
import { loadWorkflows } from "./workflows";
import { recordMessageMemory } from "./memory/auto";
import { initTelemetry, flushTelemetry, trackSpawn } from "./core/telemetry";

export const OrchestratorPlugin: Plugin = async (ctx) => {
  // CRITICAL: Prevent recursive spawning - if this is a worker process, skip orchestrator initialization
  if (process.env.OPENCODE_ORCHESTRATOR_WORKER === "1") {
    return {}; // Return empty plugin - workers don't need orchestrator capabilities
  }

  const { config, sources } = await loadOrchestratorConfig({
    directory: ctx.directory,
    worktree: ctx.worktree || undefined,
  });

  // Ensure the orchestrator runtime is online (bridge + cleanup handlers).
  await ensureRuntime();

  setDirectory(ctx.directory);
  setWorktree(ctx.worktree);
  setProjectId(ctx.project.id);
  setClient(ctx.client);
  setSpawnDefaults({ basePort: config.basePort, timeout: config.startupTimeout });
  setProfiles(config.profiles);
  setUiDefaults({ defaultListFormat: config.ui?.defaultListFormat });
  setLoggerConfig({});
  setWorkflowConfig(config.workflows);
  setSecurityConfig(config.security);
  loadWorkflows(config);

  // Initialize telemetry if enabled
  if (config.telemetry?.enabled !== false) {
    initTelemetry(config.telemetry?.apiKey, config.telemetry?.host);
  }

  const showToast = (message: string, variant: "success" | "info" | "warning" | "error") =>
    (config.ui?.toasts === false
      ? Promise.resolve()
      : ctx.client.tui.showToast({ body: { message, variant } }).catch(() => {}));

  const lastStatus = new Map<string, string>();
  const onWorkerUpdate = (instance: WorkerInstance) => {
    const id = instance.profile.id;
    const status = instance.status;
    const prev = lastStatus.get(id);
    if (prev === status) return;
    lastStatus.set(id, status);

    if (status === "ready") {
      // Only toast when a worker comes online, not after every request.
      if (prev === "starting") {
        void showToast(`Worker "${instance.profile.name}" ready`, "success");
        trackSpawn(id, "ready", { model: instance.profile.model });
      }
    } else if (status === "error") {
      void showToast(`Worker "${instance.profile.name}" error: ${instance.error ?? "unknown"}`, "error");
      trackSpawn(id, "error", { error: instance.error });
    }
  };
  const onWorkerRemove = (instance: WorkerInstance) => {
    lastStatus.delete(instance.profile.id);
  };
  registry.on("registered", onWorkerUpdate);
  registry.on("updated", onWorkerUpdate);
  registry.on("unregistered", onWorkerRemove);

  const configMsg = sources.project
    ? `Orchestrator loaded (project config)`
    : sources.global
      ? `Orchestrator loaded (global config)`
      : `Orchestrator loaded (defaults)`;
  void showToast(configMsg, "success");

  if (!sources.global && !sources.project) {
    void showToast("Tip: open commands and run `orchestrator.spawn.coder` (or any profile)", "info");
  }

  if (config.autoSpawn && config.spawn.length > 0) {
    void (async () => {
      void showToast(`Spawning ${config.spawn.length} worker(s)…`, "info");
      const profilesToSpawn = config.spawn.map((id) => config.profiles[id]).filter(Boolean);
      const { succeeded, failed } = await spawnWorkers(profilesToSpawn, {
        basePort: config.basePort,
        timeout: config.startupTimeout,
        directory: ctx.directory,
        client: ctx.client,
      });
      if (failed.length === 0) {
        void showToast(`Spawned ${succeeded.length} worker(s)`, "success");
      } else {
        void showToast(
          `Spawned ${succeeded.length} worker(s), ${failed.length} failed`,
          succeeded.length > 0 ? "warning" : "error"
        );
      }
    })().catch((err) => {
      void showToast(`Auto-spawn failed: ${err instanceof Error ? err.message : String(err)}`, "error");
    });
  }

  const idleNotifier = createIdleNotifier(ctx, config.notifications?.idle ?? {});
  const pruneTransform = createPruningTransform(config.pruning);
  const orchestratorAgentName = config.agent?.name ?? "orchestrator";
  const orchestratorSessionIds = new Set<string>();

  return {
    tool: coreOrchestratorTools,
    config: async (opencodeConfig: Config) => {
      const providersFromConfig = (): Array<{ id: string; models?: Record<string, unknown> }> => {
        const out: Array<{ id: string; models?: Record<string, unknown> }> = [];
        const providerObj = (opencodeConfig as any).provider as Record<string, any> | undefined;
        if (!providerObj || typeof providerObj !== "object") return out;
        for (const [id, cfg] of Object.entries(providerObj)) {
          if (!cfg || typeof cfg !== "object") continue;
          const models = (cfg as any).models;
          out.push({ id, models: (models && typeof models === "object") ? models : undefined });
        }
        return out;
      };

      const resolveInConfig = (model: string | undefined): string | undefined => {
        if (!model) return undefined;
        if (model.startsWith("auto") || model.startsWith("node")) return undefined;
        if (model.startsWith("opencode/")) return model;
        const providers = providersFromConfig();
        const resolved = resolveModelRef(model, providers as any);
        if ("error" in resolved) return undefined;
        return resolved.full;
      };

      // macOS: ctrl+left/right are often reserved by Mission Control / desktop switching.
      // Override to alt+left/right by default to avoid a broken "child session switching" UX.
      if (process.platform === "darwin") {
        const keybinds = ((opencodeConfig as any).keybinds ?? {}) as Record<string, unknown>;
        const cycle = String(keybinds.session_child_cycle ?? "");
        const reverse = String(keybinds.session_child_cycle_reverse ?? "");
        const isMacBlocked = (v: string) => v === "ctrl+right" || v === "ctrl+left";
        if (!cycle || isMacBlocked(cycle)) keybinds.session_child_cycle = "alt+right";
        if (!reverse || isMacBlocked(reverse)) keybinds.session_child_cycle_reverse = "alt+left";
        (opencodeConfig as any).keybinds = keybinds;
      }

      const isFullModel = (m: unknown): m is string =>
        typeof m === "string" && m.includes("/") && !m.startsWith("auto") && !m.startsWith("node");
      const desiredOrchestratorModel = isFullModel(config.agent?.model) ? config.agent?.model : undefined;
      const resolvedOrchestratorModel = resolveInConfig(desiredOrchestratorModel);

      if (config.agent?.enabled !== false) {
        const name = config.agent?.name ?? "orchestrator";
        const agentPrompt =
          config.agent?.prompt ??
          `You are the orchestrator agent for OpenCode.\n\n` +
            `Your job is to coordinate specialized workers (sub-agents) for best speed/quality.\n` +
            `Use these tools:\n` +
            `- orchestrator_status to see config + mapping\n` +
            `- list_profiles / list_workers to understand what's available\n` +
            `- list_models to see available models\n` +
            `- spawn_worker to start the right specialist\n` +
            `- delegate_task to route work\n` +
            `- ask_worker to send a specific request\n` +
            `- ask_worker_async + await_worker_job to run workers in parallel\n` +
            `- orchestrator_results / orchestrator_messages to inspect worker outputs + inter-agent messages\n` +
            `- stop_worker to shut down workers\n\n` +
            `Prefer delegating: vision for images, docs for research, coder for implementation, architect for planning, explorer for quick codebase lookups.`;

        const existing = (opencodeConfig.agent ?? {}) as Record<string, any>;
        const prior = (existing[name] ?? {}) as Record<string, unknown>;
        opencodeConfig.agent = {
          ...existing,
          [name]: {
            ...prior,
            description: "Coordinates specialized workers for multi-agent workflows",
            model: resolvedOrchestratorModel ?? desiredOrchestratorModel ?? (opencodeConfig as any).model,
            prompt: agentPrompt,
            mode: config.agent?.mode ?? "primary",
            ...(config.agent?.color ? { color: config.agent.color } : {}),
          },
        } as any;
      }

      // Optional: if enabled, also default the built-in `build` agent to the orchestrator model.
      if (config.agent?.applyToBuild === true && (resolvedOrchestratorModel ?? desiredOrchestratorModel)) {
        const agents = (opencodeConfig.agent ?? {}) as Record<string, any>;
        const buildAgent = agents.build;
        const target = resolvedOrchestratorModel ?? desiredOrchestratorModel!;
        if (buildAgent && typeof buildAgent === "object") buildAgent.model = target;
        if (!buildAgent) agents.build = { model: target };
        (opencodeConfig as any).agent = agents;
      }

      // Keep profile models as configured (often `node:*` or canonical IDs).
      // Resolution happens at spawn-time based on last-used model + configured providers.

      if (config.commands?.enabled !== false) {
        const prefix = config.commands?.prefix ?? "orchestrator.";
        const existing = (opencodeConfig.command ?? {}) as Record<string, any>;

        // Simplified commands - only essential ones
        const baseCommands: Record<string, any> = {
          [`${prefix}status`]: {
            description: "Show orchestrator status (workers, profiles, config)",
            template: "Call orchestrator_status({ format: 'markdown' }).",
          },
          [`${prefix}models`]: {
            description: "List available models from your OpenCode config",
            template: "Call list_models({ format: 'markdown' }).",
          },
          [`${prefix}profiles`]: {
            description: "List available worker profiles",
            template: "Call list_profiles({ format: 'markdown' }).",
          },
          [`${prefix}workers`]: {
            description: "List running workers",
            template: "Call list_workers({ format: 'markdown' }).",
          },
        };

        if (config.workflows?.enabled !== false) {
          baseCommands[`${prefix}workflows`] = {
            description: "List available workflows",
            template: "Call list_workflows({ format: 'markdown' }).",
          };
          baseCommands[`${prefix}boomerang`] = {
            description: "Run the RooCode boomerang workflow (plan, implement, review, fix)",
            template: "Call run_workflow({ workflowId: 'roocode-boomerang', task: '<task>' }).",
          };
        }

        const profileCommands: Record<string, any> = {};
        for (const profile of Object.values(config.profiles)) {
          profileCommands[`${prefix}spawn.${profile.id}`] = {
            description: `Spawn worker: ${profile.name} (${profile.id})`,
            template: `Call spawn_worker({ profileId: '${profile.id}' }).`,
          };
        }

        opencodeConfig.command = {
          ...baseCommands,
          ...profileCommands,
          ...existing,
        } as any;
      }
    },
    "experimental.chat.system.transform": async (_input, output) => {
      if (config.ui?.injectSystemContext === false) return;
      if (registry.workers.size === 0) return;
      output.system.push(registry.getSummary({ maxWorkers: config.ui?.systemContextMaxWorkers ?? 12 }));
    },
    "experimental.chat.messages.transform": pruneTransform,
    "chat.message": async (input, _output) => {
      if (input.agent === orchestratorAgentName) orchestratorSessionIds.add(input.sessionID);

      if (config.memory?.enabled !== false && config.memory?.autoRecord !== false) {
        const extractText = (msg: any): string => {
          if (!msg) return "";
          if (typeof msg.message === "string") return msg.message;
          if (typeof msg.content === "string") return msg.content;
          if (typeof msg.text === "string") return msg.text;
          const parts = Array.isArray(msg.parts) ? msg.parts : Array.isArray(msg.content?.parts) ? msg.content.parts : [];
          if (Array.isArray(parts)) {
            return parts.map((p: any) => (p?.type === "text" && typeof p.text === "string" ? p.text : "")).join("\n");
          }
          return "";
        };

        const text = extractText(input);
        if (text) {
          void recordMessageMemory({
            text,
            sessionId: input.sessionID,
            messageId: input.messageID,
            role: typeof (input as any).role === "string" ? (input as any).role : undefined,
            userId: typeof input.agent === "string" ? input.agent : undefined,
            scope: config.memory?.scope ?? "project",
            projectId: config.memory?.scope === "project" ? ctx.project.id : undefined,
            maxChars: config.memory?.maxChars,
          });
        }
      }
    },
    event: async ({ event }) => {
      if (event.type === "server.instance.disposed") {
        registry.off("registered", onWorkerUpdate);
        registry.off("updated", onWorkerUpdate);
        registry.off("unregistered", onWorkerRemove);
        await shutdownAllWorkers().catch(() => {});
        await flushTelemetry().catch(() => {});
      }
      if (event.type === "session.created" || event.type === "session.updated") {
        const info = (event as any)?.properties?.info as any;
        if (info?.id && typeof info.title === "string" && typeof info.directory === "string") {
          await upsertSessionEntry({
            hostPid: process.pid,
            sessionId: info.id,
            title: info.title,
            directory: info.directory,
            createdAt: typeof info?.time?.created === "number" ? info.time.created : Date.now(),
          }).catch(() => {});
        }
      }
      if (event.type === "session.deleted") {
        const sessionId = (event as any)?.properties?.info?.id as string | undefined;
        if (sessionId) await removeSessionEntry(sessionId, process.pid).catch(() => {});
        if (sessionId) {
          const owned = registry.getWorkersForSession(sessionId);
          for (const workerId of owned) {
            await stopWorker(workerId).catch(() => {});
          }
          registry.clearSessionOwnership(sessionId);
          orchestratorSessionIds.delete(sessionId);
        }
      }
      await idleNotifier({ event });
    },
  };
};

export default OrchestratorPlugin;
