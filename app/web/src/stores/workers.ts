import { create } from "zustand";
import type { Worker, Job } from "@/lib/api";

interface WorkersState {
  workers: Map<string, Worker>;
  jobs: Job[];
  selectedId: string | null;
  connected: boolean;

  setWorkers: (workers: Worker[]) => void;
  updateWorker: (id: string, updates: Partial<Worker>) => void;
  removeWorker: (id: string) => void;
  setJobs: (jobs: Job[]) => void;
  select: (id: string | null) => void;
  setConnected: (connected: boolean) => void;
}

export const useWorkersStore = create<WorkersState>((set) => ({
  workers: new Map(),
  jobs: [],
  selectedId: null,
  connected: false,

  setWorkers: (workers) =>
    set({
      workers: new Map(workers.map((w) => [w.profile.id, w])),
    }),

  updateWorker: (id, updates) =>
    set((state) => {
      const worker = state.workers.get(id);
      if (!worker) return state;

      const newWorkers = new Map(state.workers);
      newWorkers.set(id, { ...worker, ...updates });
      return { workers: newWorkers };
    }),

  removeWorker: (id) =>
    set((state) => {
      const newWorkers = new Map(state.workers);
      newWorkers.delete(id);
      return {
        workers: newWorkers,
        selectedId: state.selectedId === id ? null : state.selectedId,
      };
    }),

  setJobs: (jobs) => set({ jobs }),

  select: (id) => set({ selectedId: id }),

  setConnected: (connected) => set({ connected }),
}));

// Selectors
export const useWorkers = () =>
  useWorkersStore((s) => Array.from(s.workers.values()));
export const useSelectedWorker = () =>
  useWorkersStore((s) => (s.selectedId ? s.workers.get(s.selectedId) : null));
export const useWorkerById = (id: string) =>
  useWorkersStore((s) => s.workers.get(id));
export const useJobs = () => useWorkersStore((s) => s.jobs);
export const useConnected = () => useWorkersStore((s) => s.connected);
