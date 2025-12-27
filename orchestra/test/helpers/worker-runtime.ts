import { createApi } from "../../src/api";
import { createCommunication } from "../../src/communication";
import { createMemoryStore } from "../../src/memory";
import type { WorkerProfile } from "../../src/types";
import { createWorkerManager } from "../../src/workers";

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
      timeout: input.timeoutMs ?? 120_000,
      directory: input.directory,
      profiles: input.profiles,
    },
    deps: { api, communication, memory },
  });

  await workers.start();

  const stop = async () => {
    const active = workers.listWorkers();
    await Promise.allSettled(active.map((w) => workers.stopWorker(w.profile.id)));
    await workers.stop();
    await communication.stop();
    await memory.stop();
    await api.stop();
  };

  return { api, communication, memory, workers, stop };
}
