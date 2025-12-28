import type { ApiService } from "../api";
import type { WorkerInstance } from "../types";
import { withTimeout } from "./spawn-helpers";

type WorkerClient = ApiService["client"];
type SessionCreateArgs = Parameters<WorkerClient["session"]["create"]>[0] & { throwOnError?: false };
type ServerBundle = Awaited<ReturnType<ApiService["createServer"]>>;
type ServerConfig = NonNullable<Parameters<ApiService["createServer"]>[0]>["config"];

/** Start an OpenCode server with worker isolation flags applied. */
export const startWorkerServer = async (input: {
  api: ApiService;
  hostname: string;
  port: number;
  timeoutMs: number;
  config: Record<string, unknown>;
  pluginPath?: string;
}): Promise<ServerBundle> => {
  const previousWorkerPluginPath = process.env.OPENCODE_WORKER_PLUGIN_PATH;
  const previousWorkerFlag = process.env.OPENCODE_ORCHESTRATOR_WORKER;

  process.env.OPENCODE_ORCHESTRATOR_WORKER = "1";

  if (input.pluginPath) {
    process.env.OPENCODE_WORKER_PLUGIN_PATH = input.pluginPath;
  }

  return await input.api
    .createServer({
      hostname: input.hostname,
      port: input.port,
      timeout: input.timeoutMs,
      config: input.config as ServerConfig,
    })
    .finally(() => {
      if (previousWorkerFlag === undefined) {
        delete process.env.OPENCODE_ORCHESTRATOR_WORKER;
      } else {
        process.env.OPENCODE_ORCHESTRATOR_WORKER = previousWorkerFlag;
      }
      if (previousWorkerPluginPath === undefined) {
        delete process.env.OPENCODE_WORKER_PLUGIN_PATH;
      } else {
        process.env.OPENCODE_WORKER_PLUGIN_PATH = previousWorkerPluginPath;
      }
    });
};

/** Create a worker session with a timeout guard. */
export const createWorkerSession = async (input: {
  client: WorkerClient;
  directory: string;
  timeoutMs: number;
  title: string;
}): Promise<unknown> => {
  const sessionAbort = new AbortController();
  try {
    const createArgs: SessionCreateArgs = {
      body: { title: input.title },
      query: { directory: input.directory },
      signal: sessionAbort.signal,
      throwOnError: false,
    };
    return await withTimeout(input.client.session.create(createArgs), input.timeoutMs, sessionAbort);
  } catch (error) {
    return { error };
  }
};

/** Create a subagent session on the parent OpenCode server. */
export const createSubagentSession = async (input: {
  api: ApiService;
  timeoutMs: number;
  title: string;
  parentSessionId?: string;
}): Promise<unknown> => {
  const sessionAbort = new AbortController();
  try {
    const createArgs: SessionCreateArgs = {
      body: { title: input.title, ...(input.parentSessionId ? { parentID: input.parentSessionId } : {}) },
      signal: sessionAbort.signal,
      throwOnError: false,
    };
    return await withTimeout(input.api.session.create(createArgs), input.timeoutMs, sessionAbort);
  } catch (error) {
    return { error };
  }
};

/** Apply server connection info to a worker instance. */
export const applyServerBundleToInstance = (instance: WorkerInstance, bundle: ServerBundle) => {
  const { client, server } = bundle;
  instance.shutdown = async () => server.close();
  instance.serverUrl = server.url;
  try {
    const u = new URL(server.url);
    const actualPort = Number(u.port);
    if (Number.isFinite(actualPort) && actualPort > 0) instance.port = actualPort;
  } catch {
    // ignore
  }
  instance.client = client;
  return { client, server };
};
