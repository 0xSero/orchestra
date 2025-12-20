import type { Plugin } from "@opencode-ai/plugin";
import type { Config } from "@opencode-ai/sdk";
import { loadOrchestratorConfig } from "../config/orchestrator";
import { registry } from "./registry";
import {
  orchestratorTools,
  setClient,
  setDirectory,
  setProfiles,
  setProjectId,
  setSpawnDefaults,
  setSecurityDefaults,
  setUiDefaults,
  setWorkflowDefaults,
  setWorktree,
} from "../tools";
import type { WorkerInstance } from "../types";
import { createIdleNotifier } from "../ux/idle-notification";
import { createPruningTransform } from "../ux/pruning";
import { spawnWorkers } from "../workers/spawner";
import { WorkflowEngine } from "./workflows/engine";
import { setWorkflowEngine } from "./workflows/state";
import { createRoocodeBoomerangWorkflow } from "../workflows";

function isFullModel(m: unknown): m is string {
  return typeof m === "string" && m.includes("/") && !m.startsWith("auto");
}

export function createOrchestratorPlugin(): Plugin {
  return async (ctx) => {
    const { config, sources } = await loadOrchestratorConfig({
      directory: ctx.directory,
      worktree: ctx.worktree || undefined,
    });

    setDirectory(ctx.directory);
    setWorktree(ctx.worktree);
    setProjectId(ctx.project.id);
    setClient(ctx.client);
    setSpawnDefaults({ basePort: config.basePort, timeout: config.startupTimeout });
    setProfiles(config.profiles);
    setUiDefaults({ defaultListFormat: config.ui?.defaultListFormat });
    setSecurityDefaults(config.security);
    setWorkflowDefaults(config.workflows);

    // Initialize workflows (core engine + built-ins).
    const wfEngine = new WorkflowEngine();
    const rb = config.workflows?.roocodeBoomerang;
    if (config.workflows?.enabled !== false && rb?.enabled !== false) {
      wfEngine.register(createRoocodeBoomerangWorkflow({ steps: rb?.steps }));
    }
    setWorkflowEngine(wfEngine);

    const showToast = (message: string, variant: "success" | "info" | "warning" | "error") =>
      config.ui?.toasts === false
        ? Promise.resolve()
        : ctx.client.tui.showToast({ body: { message, variant } }).catch(() => {});

    const lastStatus = new Map<string, string>();
    const onWorkerUpdate = (instance: WorkerInstance) => {
      const id = instance.profile.id;
      const status = instance.status;
      if (lastStatus.get(id) === status) return;
      lastStatus.set(id, status);

      if (status === "ready") {
        void showToast(`Worker "${instance.profile.name}" ready`, "success");
      } else if (status === "error") {
        void showToast(`Worker "${instance.profile.name}" error: ${instance.error ?? "unknown"}`, "error");
      }
    };
    registry.on("registered", onWorkerUpdate);
    registry.on("updated", onWorkerUpdate);

    const configMsg = sources.project
      ? `Orchestrator loaded (project config)`
      : sources.global
        ? `Orchestrator loaded (global config)`
        : `Orchestrator loaded (defaults)`;
    void showToast(configMsg, "success");

    if (!sources.global && !sources.project) {
      void showToast("Tip: run `orchestrator.setup` to auto-configure profile models", "info");
      void ctx.client.tui.appendPrompt({ body: { text: "orchestrator.setup" } }).catch(() => {});
    }

    if (config.autoSpawn && config.spawn.length > 0) {
      void (async () => {
        void showToast(`Spawning ${config.spawn.length} worker(s)…`, "info");
        const profilesToSpawn = config.spawn.map((id) => config.profiles[id]).filter(Boolean);
        const { succeeded, failed } = await spawnWorkers(profilesToSpawn, {
          basePort: config.basePort,
          timeout: config.startupTimeout,
          directory: ctx.directory,
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

    return {
      tool: orchestratorTools,
      config: async (opencodeConfig: Config) => {
        const desiredOrchestratorModel = isFullModel(config.agent?.model) ? config.agent?.model : undefined;

        if (config.agent?.enabled !== false) {
          const name = config.agent?.name ?? "orchestrator";
          const agentPrompt =
            config.agent?.prompt ??
            `You are the orchestrator agent for OpenCode.\n\n` +
              `Your job is to coordinate specialized workers (sub-agents) for best speed/quality.\n` +
              `Use these tools:\n` +
              `- list_profiles / list_workers to understand what's available\n` +
              `- spawn_worker to start the right specialist\n` +
              `- find_worker and delegate_task to route work\n` +
              `- ask_worker to send a specific request\n` +
              `- list_workflows / run_workflow for multi-step workflows\n\n` +
              `Prefer delegating: vision for images, docs for research, coder for implementation, architect for planning, explorer for quick codebase lookups.`;

          const existing = (opencodeConfig.agent ?? {}) as Record<string, any>;
          const prior = (existing[name] ?? {}) as Record<string, unknown>;
          opencodeConfig.agent = {
            ...existing,
            [name]: {
              ...prior,
              description: "Coordinates specialized workers for multi-agent workflows",
              model: desiredOrchestratorModel ?? (opencodeConfig as any).model,
              prompt: agentPrompt,
              mode: config.agent?.mode ?? "primary",
              ...(config.agent?.color ? { color: config.agent.color } : {}),
            },
          } as any;
        }

        // If you set an orchestrator model in orchestrator.json, also default the built-in `build` agent to it.
        if (desiredOrchestratorModel) {
          const agents = (opencodeConfig.agent ?? {}) as Record<string, any>;
          const buildAgent = agents.build;
          if (buildAgent && typeof buildAgent === "object") {
            buildAgent.model = desiredOrchestratorModel;
          }
        }

        if (config.commands?.enabled !== false) {
          const prefix = config.commands?.prefix ?? "orchestrator.";
          const existing = (opencodeConfig.command ?? {}) as Record<string, any>;

          const baseCommands: Record<string, any> = {
            [`${prefix}help`]: {
              description: "Show orchestrator usage help",
              template: "Call orchestrator_help({}) and follow its instructions.",
            },
            [`${prefix}models`]: {
              description: "List configured OpenCode models (copy provider/model IDs)",
              template: "Call list_models({ format: 'markdown' }).",
            },
            [`${prefix}setup`]: {
              description: "Auto-fill profile→model mapping from current model",
              template: "Call autofill_profile_models({ scope: 'global', setAgent: true, showToast: true }).",
            },
            [`${prefix}profiles`]: {
              description: "List available worker profiles",
              template: "Call list_profiles({ format: 'markdown' }).",
            },
            [`${prefix}workers`]: {
              description: "List running workers",
              template: "Call list_workers({ format: 'markdown' }).",
            },
            [`${prefix}workflows`]: {
              description: "List available workflows",
              template: "Call list_workflows({ format: 'markdown' }).",
            },
            [`${prefix}boomerang`]: {
              description: "Run the Roocode sequential boomerang workflow",
              template: "Call run_workflow({ workflowId: 'roocode.boomerang.sequential', task: '...' }).",
            },
          };

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
      event: idleNotifier,
    };
  };
}

