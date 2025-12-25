import { createApi } from "../../src/api";
import { createCommunication } from "../../src/communication";
import { createMemoryStore } from "../../src/memory";
import { createWorkerManager } from "../../src/workers";
import type { WorkerProfile } from "../../src/types";

export async function createTestWorkerRuntime(input: {
  profiles: Record<string, WorkerProfile>;
  directory: string;
  timeoutMs?: number;
}) {
  const api = createApi({
    config: { baseUrl: "http://127.0.0.1:0", directory: input.directory },
    deps: {},
  });
  const communication = createCommunication({ config: {}, deps: { api } });
  const memory = createMemoryStore({ config: { enabled: false }, deps: { api } });
  const workers = createWorkerManager({
    config: {
      basePort: 0,
      timeout: input.timeoutMs ?? 60_000,
      directory: input.directory,
      profiles: input.profiles,
    },
    deps: { api, communication, memory },
  });

  await workers.start();

  const stop = async () => {
    await workers.stop();
    await communication.stop();
    await memory.stop();
    await api.stop();
  };

  return { api, communication, memory, workers, stop };
}
