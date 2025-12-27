import type { Hooks, PluginInput } from "@opencode-ai/plugin";
import type { Config } from "@opencode-ai/sdk";
import { createApi } from "../api";
import { createSkillsApiServer } from "../api/skills-server";
import type { CommandRouter } from "../commands";
import { createCommandRouter } from "../commands";
import { createCommunication } from "../communication";
import { createDatabase } from "../db";
import { createMemoryStore } from "../memory";
import { ensureNeo4jRunning, setNeo4jIntegrationsConfig } from "../memory/neo4j";
import { createOrchestrator } from "../orchestrator";
import { createSkillsService } from "../skills/service";
import { createTools } from "../tools";
import type { Factory, OrchestratorConfig, ServiceLifecycle } from "../types";
import {
  createVisionRoutingState,
  routeVisionMessage,
  syncVisionProcessedMessages,
  type VisionChatInput,
  type VisionChatOutput,
} from "../ux/vision-routing";
import { createWorkerManager } from "../workers";
import { createWorkflowEngine } from "../workflows/factory";
import { createProfileSync } from "./container-profiles";
import { registerCommunicationToasts } from "./container-toasts";
import { getVisionRuntimeConfig } from "./container-vision";

export type CoreConfig = {
  ctx: PluginInput;
  config: OrchestratorConfig;
};

export type CoreHooks = Hooks & {
  "tui.command.execute": CommandRouter["execute"];
};

export type CoreService = ServiceLifecycle & {
  hooks: CoreHooks;
  services: {
    api: ReturnType<typeof createApi>;
    communication: ReturnType<typeof createCommunication>;
    database: ReturnType<typeof createDatabase>;
    memory: ReturnType<typeof createMemoryStore>;
    workers: ReturnType<typeof createWorkerManager>;
    workflows: ReturnType<typeof createWorkflowEngine>;
    orchestrator: ReturnType<typeof createOrchestrator>;
    tools: ReturnType<typeof createTools>;
    commands: ReturnType<typeof createCommandRouter>;
    skills: ReturnType<typeof createSkillsService>;
    skillsApi: ReturnType<typeof createSkillsApiServer>;
  };
};

/** Create the orchestrator core services, hooks, and lifecycle handlers. */
export const createCore: Factory<CoreConfig, Record<string, never>, CoreService> = ({ config }) => {
  setNeo4jIntegrationsConfig(config.config.integrations?.neo4j);

  const api = createApi({
    config: { directory: config.ctx.directory },
    deps: { client: config.ctx.client },
  });
  const communication = createCommunication({ config: {}, deps: { api } });
  const memory = createMemoryStore({ config: config.config.memory, deps: { api } });
  const baseProfiles = { ...config.config.profiles };
  const profiles = { ...baseProfiles };
  config.config.profiles = profiles;
  const projectDir = config.ctx.worktree || config.ctx.directory;
  const database = createDatabase({ config: { directory: projectDir }, deps: {} });
  const skills = createSkillsService(projectDir);
  const workers = createWorkerManager({
    config: {
      basePort: config.config.basePort,
      timeout: config.config.startupTimeout,
      directory: config.ctx.directory,
      profiles,
      modelSelection: config.config.modelSelection,
      modelAliases: config.config.modelAliases,
    },
    deps: { api, communication, memory },
  });
  const workflows = createWorkflowEngine({ config: config.config.workflows, deps: {} });
  const orchestrator = createOrchestrator({ config: config.config, deps: { api, workers, workflows, communication } });
  const tools = createTools({ config: config.config, deps: { orchestrator, workers, workflows } });
  const commands = createCommandRouter({
    api,
    orchestrator,
    workers,
    memory,
    config: config.config,
    projectDir,
  });
  const visionState = createVisionRoutingState();
  const { timeoutMs: visionTimeoutMs, prompt: visionPrompt, logSink } = getVisionRuntimeConfig(projectDir);

  const visionDeps = {
    workers,
    ensureWorker: (input: { workerId: string; reason: "manual" | "on-demand" }) => orchestrator.ensureWorker(input),
    profiles,
    communication,
    timeoutMs: visionTimeoutMs,
    ...(visionPrompt ? { prompt: visionPrompt } : {}),
    logSink,
  };
  const { refreshProfiles } = createProfileSync({
    projectDir,
    baseProfiles,
    profiles,
    database,
  });

  const skillsApi = createSkillsApiServer({
    config: { enabled: true },
    deps: {
      skills,
      workers,
      db: database,
      onWorkerConfigChanged: () => {
        void refreshProfiles().catch(() => {});
      },
      onPreferencesChanged: () => {},
    },
  });

  skills.events.on((event) => {
    if (event.type === "skill.created") {
      communication.emit("skill.created", { skill: event.skill }, { source: "orchestrator" });
    }
    if (event.type === "skill.updated") {
      communication.emit("skill.updated", { skill: event.skill }, { source: "orchestrator" });
    }
    if (event.type === "skill.deleted") {
      communication.emit("skill.deleted", { id: event.id, scope: event.scope }, { source: "orchestrator" });
    }
    void refreshProfiles().catch(() => {});
  });

  const start = async () => {
    await api.start();
    await communication.start();
    await database.start();

    // Auto-start Neo4j if configured
    const neo4jCfg = config.config.integrations?.neo4j;
    if (neo4jCfg && neo4jCfg.enabled !== false) {
      const result = await ensureNeo4jRunning(neo4jCfg);
      if (result.status === "created" || result.status === "started") {
        console.log(`[Neo4j] ${result.message}`);
      } else if (result.status === "failed") {
        console.log(`[Neo4j] Warning: ${result.message}`);
      }
    }

    await memory.start();
    await refreshProfiles();
    await workers.start();
    await workflows.start();
    await orchestrator.start();

    // Start skills API in background (non-blocking)
    skillsApi.start().catch((err) => {
      console.log("[Core] Skills API failed to start (non-fatal):", err);
    });
    registerCommunicationToasts({
      api,
      communication,
      profiles,
      config: config.config,
    });
  };

  const stop = async () => {
    await orchestrator.stop();
    await workflows.stop();
    await workers.stop();
    await skillsApi.stop();
    await memory.stop();
    await database.stop();
    await communication.stop();
    await api.stop();
  };

  const hooks: CoreHooks = {
    tool: tools.tool,
    config: async (input: Config) => {
      // Inject the orchestrator agent if enabled in config
      const agentCfg = config.config.agent;
      if (agentCfg?.enabled !== false) {
        const agentName = agentCfg?.name ?? "orchestrator";
        input.agent = input.agent ?? {};
        input.agent[agentName] = {
          model: agentCfg?.model ?? "anthropic/claude-opus-4-5",
          mode: agentCfg?.mode ?? "primary",
          description: "OpenCode Orchestrator - Coordinates specialized AI workers for complex tasks",
          prompt: agentCfg?.prompt ?? undefined,
          ...(agentCfg?.color ? { color: agentCfg.color } : {}),
        };
      }

      const commandConfig = commands.commandConfig();
      if (Object.keys(commandConfig).length > 0) {
        input.command = { ...(input.command ?? {}), ...commandConfig };
      }
    },
    "tool.execute.before": tools.guard,
    "chat.message": async (input: VisionChatInput, output: VisionChatOutput) => {
      await routeVisionMessage(
        {
          sessionID: input.sessionID,
          agent: input.agent,
          messageID: input.messageID,
          role: output?.message?.role,
        },
        output,
        visionDeps,
        visionState,
      );
    },
    // tui.command.execute hook input type is defined by the SDK plugin system
    "tui.command.execute": async (input) => commands.execute(input),
    "experimental.chat.messages.transform": async (_input, output) => {
      syncVisionProcessedMessages(output, visionState);
    },
    "experimental.chat.system.transform": tools.systemTransform,
    "experimental.session.compacting": tools.compaction,
  };

  return {
    hooks,
    services: {
      api,
      communication,
      database,
      memory,
      workers,
      workflows,
      orchestrator,
      tools,
      commands,
      skills,
      skillsApi,
    },
    start,
    stop,
    health: async () => ({ ok: true }),
  };
};
