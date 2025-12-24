import { useCallback } from "react";
import { api } from "@/lib/api";
import {
  useWorkersStore,
  useWorkers as useWorkersSelector,
  useSelectedWorker,
  useJobs as useJobsSelector,
} from "@/stores/workers";

export function useWorkerActions() {
  const { updateWorker, removeWorker, select } = useWorkersStore();

  const spawnWorker = useCallback(async (profileId: string) => {
    const worker = await api.workers.spawn(profileId);
    updateWorker(worker.profile.id, worker);
    return worker;
  }, [updateWorker]);

  const stopWorker = useCallback(async (id: string) => {
    await api.workers.stop(id);
    removeWorker(id);
  }, [removeWorker]);

  const sendMessage = useCallback(async (id: string, content: string) => {
    // Mark worker as busy optimistically
    updateWorker(id, { status: "busy", currentTask: content.slice(0, 50) });

    try {
      const result = await api.workers.message(id, content);
      updateWorker(id, { status: "ready", currentTask: undefined });
      return result;
    } catch (error) {
      updateWorker(id, { status: "error", error: (error as Error).message });
      throw error;
    }
  }, [updateWorker]);

  return {
    spawnWorker,
    stopWorker,
    sendMessage,
    selectWorker: select,
  };
}

export { useWorkersSelector as useWorkers, useSelectedWorker, useJobsSelector as useJobs };
