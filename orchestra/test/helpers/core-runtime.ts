import { createApi } from "../../src/api";
import { createCommunication } from "../../src/communication";
import { createMemoryStore } from "../../src/memory";
import { createOrchestrator } from "../../src/orchestrator";
import { createTools } from "../../src/tools";
import type { OrchestratorConfig, WorkerProfile } from "../../src/types";
import { createWorkerManager } from "../../src/workers";
import { createWorkflowEngine } from "../../src/workflows/factory";
import { DEFAULT_TEST_CONFIG } from "./fixtures";

export async function createTestCoreRuntime(input: {
  profiles: Record<string, WorkerProfile>;
  directory: string;
  configOverrides?: Partial<OrchestratorConfig>;
}) {
  const config: OrchestratorConfig = {
    ...DEFAULT_TEST_CONFIG,
    ...input.configOverrides,
    profiles: input.profiles,
  } as OrchestratorConfig;

  const api = createApi({
    config: { baseUrl: "http://127.0.0.1:0", directory: input.directory },
    deps: {},
  });
  const communication = createCommunication({ config: {}, deps: { api } });
  const memory = createMemoryStore({ config: { enabled: false }, deps: { api } });
  const workers = createWorkerManager({
    config: {
      basePort: config.basePort,
      timeout: config.startupTimeout,
      directory: input.directory,
      profiles: config.profiles,
      modelSelection: config.modelSelection,
      modelAliases: config.modelAliases,
    },
    deps: { api, communication, memory },
  });
  const workflows = createWorkflowEngine({ config: config.workflows, deps: {} });
  const orchestrator = createOrchestrator({ config, deps: { api, workers, workflows, communication } });
  const tools = createTools({ config, deps: { orchestrator, workers, workflows } });

  await workers.start();
  await workflows.start();
  await orchestrator.start();

  const stop = async () => {
    await orchestrator.stop();
    const active = workers.listWorkers();
    await Promise.allSettled(active.map((w) => workers.stopWorker(w.profile.id)));
    await workflows.stop();
    await workers.stop();
    await memory.stop();
    await communication.stop();
    await api.stop();
  };

  return { config, api, communication, memory, workers, workflows, orchestrator, tools, stop };
}
