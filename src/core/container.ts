import type { PluginInput } from "@opencode-ai/plugin";
import type { Factory, ServiceLifecycle } from "../types";
import type { OrchestratorConfig } from "../types";
import { createApi } from "../api";
import { createCommunication } from "../communication";
import { createMemoryStore } from "../memory";
import { createWorkerManager } from "../workers";
import { createWorkflowEngine } from "../workflows/factory";
import { createOrchestrator } from "../orchestrator";
import { createTools } from "../tools";
import { setNeo4jIntegrationsConfig } from "../memory/neo4j";

export type CoreConfig = {
  ctx: PluginInput;
  config: OrchestratorConfig;
};

export type CoreHooks = {
  tool: Record<string, any>;
  "tool.execute.before": any;
  "experimental.chat.system.transform": any;
  "experimental.session.compacting": any;
};

export type CoreService = ServiceLifecycle & {
  hooks: CoreHooks;
  services: {
    api: ReturnType<typeof createApi>;
    communication: ReturnType<typeof createCommunication>;
    memory: ReturnType<typeof createMemoryStore>;
    workers: ReturnType<typeof createWorkerManager>;
    workflows: ReturnType<typeof createWorkflowEngine>;
    orchestrator: ReturnType<typeof createOrchestrator>;
    tools: ReturnType<typeof createTools>;
  };
};

export const createCore: Factory<CoreConfig, {}, CoreService> = ({ config }) => {
  setNeo4jIntegrationsConfig(config.config.integrations?.neo4j);

  const api = createApi({
    config: { directory: config.ctx.directory },
    deps: { client: config.ctx.client },
  });
  const communication = createCommunication({ config: {}, deps: { api } });
  const memory = createMemoryStore({ config: config.config.memory, deps: { api } });
  const workers = createWorkerManager({
    config: {
      basePort: config.config.basePort,
      timeout: config.config.startupTimeout,
      directory: config.ctx.directory,
      profiles: config.config.profiles,
      modelSelection: config.config.modelSelection,
      modelAliases: config.config.modelAliases,
    },
    deps: { api, communication, memory },
  });
  const workflows = createWorkflowEngine({ config: config.config.workflows });
  const orchestrator = createOrchestrator({ config: config.config, deps: { api, workers, workflows, communication } });
  const tools = createTools({ config: config.config, deps: { orchestrator, workers, workflows } });

  const start = async () => {
    await api.start();
    await communication.start();
    await memory.start();
    await workers.start();
    await workflows.start();
    await orchestrator.start();
  };

  const stop = async () => {
    await orchestrator.stop();
    await workflows.stop();
    await workers.stop();
    await memory.stop();
    await communication.stop();
    await api.stop();
  };

  const hooks: CoreHooks = {
    tool: tools.tool,
    "tool.execute.before": tools.guard,
    "experimental.chat.system.transform": tools.systemTransform,
    "experimental.session.compacting": tools.compaction,
  };

  return {
    hooks,
    services: { api, communication, memory, workers, workflows, orchestrator, tools },
    start,
    stop,
    health: async () => ({ ok: true }),
  };
};
