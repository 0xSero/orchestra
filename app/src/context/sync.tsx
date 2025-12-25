/**
 * Sync Context - Manages real-time worker and job state via SSE
 * Includes demo mode for development without backend
 */

import {
  createContext,
  useContext,
  createEffect,
  onCleanup,
  type ParentComponent,
  type Accessor,
} from "solid-js";
import { createStore, produce } from "solid-js/store";
import { useSDK } from "./sdk";
import type { Worker, Job, SnapshotEvent, WorkerEvent, StreamChunk, StreamEvent } from "@/lib/types";

// Demo data for development
const DEMO_WORKERS: Worker[] = [
  {
    id: "worker-general-001",
    name: "General Assistant",
    profile: "general",
    model: "anthropic/claude-sonnet-4-20250514",
    purpose: "General-purpose assistant for various tasks",
    status: "ready",
    port: 4101,
    supportsVision: false,
    supportsWeb: false,
    lastActivity: Date.now() - 60000,
  },
  {
    id: "worker-vision-002",
    name: "Vision Analyzer",
    profile: "vision",
    model: "openrouter/meta-llama/llama-3.2-11b-vision-instruct",
    purpose: "Image analysis and vision tasks",
    status: "busy",
    currentTask: "Analyzing screenshot for UI components...",
    port: 4102,
    supportsVision: true,
    supportsWeb: false,
    lastActivity: Date.now() - 5000,
  },
  {
    id: "worker-web-003",
    name: "Web Researcher",
    profile: "web",
    model: "anthropic/claude-sonnet-4-20250514",
    purpose: "Web browsing and research",
    status: "ready",
    port: 4103,
    supportsVision: false,
    supportsWeb: true,
    lastActivity: Date.now() - 120000,
  },
];

const DEMO_JOBS: Job[] = [
  {
    id: "job-001",
    workerId: "worker-vision-002",
    message: "Analyze the uploaded screenshot and identify all UI components",
    status: "running",
    startedAt: Date.now() - 30000,
  },
  {
    id: "job-002",
    workerId: "worker-general-001",
    message: "Write a function to parse JSON configuration files",
    status: "succeeded",
    startedAt: Date.now() - 300000,
    finishedAt: Date.now() - 250000,
    durationMs: 50000,
    responseText: "Here's the function...",
  },
  {
    id: "job-003",
    workerId: "worker-web-003",
    message: "Research the latest React 19 features and summarize",
    status: "succeeded",
    startedAt: Date.now() - 600000,
    finishedAt: Date.now() - 540000,
    durationMs: 60000,
    responseText: "React 19 introduces...",
  },
  {
    id: "job-004",
    workerId: "worker-general-001",
    message: "Fix the type error in worker-card.tsx",
    status: "failed",
    startedAt: Date.now() - 900000,
    finishedAt: Date.now() - 880000,
    durationMs: 20000,
    error: "Could not find file worker-card.tsx in the specified directory",
  },
];

interface SyncState {
  workers: Record<string, Worker>;
  jobs: Record<string, Job>;
  streams: StreamChunk[];
  connected: boolean;
  demoMode: boolean;
  lastUpdate: number;
}

interface SyncContextValue {
  // State accessors
  workers: Accessor<Worker[]>;
  jobs: Accessor<Job[]>;
  streams: Accessor<StreamChunk[]>;
  connected: Accessor<boolean>;
  demoMode: Accessor<boolean>;

  // Actions
  refreshWorkers: () => Promise<void>;
  refreshJobs: () => Promise<void>;

  // Get by ID
  getWorker: (id: string) => Worker | undefined;
  getJob: (id: string) => Job | undefined;

  // Filtered queries
  getWorkersByStatus: (status: Worker["status"]) => Worker[];
  getJobsForWorker: (workerId: string) => Job[];
}

const SyncContext = createContext<SyncContextValue>();

export const SyncProvider: ParentComponent = (props) => {
  const { client, baseUrl } = useSDK();

  const [state, setState] = createStore<SyncState>({
    workers: {},
    jobs: {},
    streams: [],
    connected: false,
    demoMode: false,
    lastUpdate: 0,
  });

  const maxStreams = 200;

  // Load demo data
  const loadDemoData = () => {
    console.log("[sync] Loading demo data (backend not available)");
    setState(produce((s) => {
      s.demoMode = true;
      s.connected = true; // Fake connected for demo
      for (const w of DEMO_WORKERS) {
        s.workers[w.id] = w;
      }
      for (const j of DEMO_JOBS) {
        s.jobs[j.id] = j;
      }
      s.streams = [];
      s.lastUpdate = Date.now();
    }));
  };

  // Initial data fetch
  const refreshWorkers = async () => {
    if (state.demoMode) return;
    try {
      const workers = await client.getWorkers();
      setState(produce((s) => {
        s.workers = {};
        for (const w of workers) {
          s.workers[w.id] = w;
        }
        s.lastUpdate = Date.now();
      }));
    } catch (err) {
      console.error("[sync] Failed to fetch workers:", err);
    }
  };

  const refreshJobs = async () => {
    if (state.demoMode) return;
    try {
      const jobs = await client.getJobs({ limit: 100 });
      setState(produce((s) => {
        s.jobs = {};
        for (const j of jobs) {
          s.jobs[j.id] = j;
        }
        s.lastUpdate = Date.now();
      }));
    } catch (err) {
      console.error("[sync] Failed to fetch jobs:", err);
    }
  };

  // Setup SSE connection
  const connectSSE = () => {
    // Determine actual SSE URL (bypass proxy for SSE)
    const sseUrl = baseUrl === "/api"
      ? "http://localhost:4080/sse"
      : `${baseUrl}/sse`;

    console.log("[sync] Connecting to SSE:", sseUrl);
    const es = new EventSource(sseUrl);

    let connectionTimeout: ReturnType<typeof setTimeout>;

    // Set timeout for initial connection
    connectionTimeout = setTimeout(() => {
      if (!state.connected && !state.demoMode) {
        console.log("[sync] Connection timeout, switching to demo mode");
        es.close();
        loadDemoData();
      }
    }, 3000);

    es.onopen = () => {
      console.log("[sync] SSE connected");
      clearTimeout(connectionTimeout);
      setState("connected", true);
      setState("demoMode", false);
    };

    es.onerror = (err) => {
      console.error("[sync] SSE error:", err);
      clearTimeout(connectionTimeout);
      setState("connected", false);

      // If not in demo mode yet, switch to demo mode after a few retries
      if (!state.demoMode) {
        es.close();
        // Try to reconnect once, then switch to demo mode
        setTimeout(() => {
          if (!state.connected) {
            loadDemoData();
          }
        }, 2000);
      }
    };

    // Handle snapshot (initial state)
    es.addEventListener("snapshot", (event) => {
      try {
        const data = JSON.parse(event.data) as SnapshotEvent;
        setState(produce((s) => {
          s.workers = {};
          for (const w of data.workers) {
            s.workers[w.id] = w;
          }
          s.jobs = {};
          for (const j of data.jobs) {
            s.jobs[j.id] = j;
          }
          if (Array.isArray(data.streams)) {
            s.streams = data.streams.slice(-maxStreams);
          }
          s.lastUpdate = Date.now();
        }));
      } catch (err) {
        console.error("[sync] Failed to parse snapshot:", err);
      }
    });

    // Handle worker events
    const workerEvents = [
      "worker:spawned",
      "worker:ready",
      "worker:busy",
      "worker:error",
      "worker:stopped",
      "worker:dead",
      "worker:updated",
    ];

    for (const eventType of workerEvents) {
      es.addEventListener(eventType, (event) => {
        try {
          const data = JSON.parse(event.data) as WorkerEvent;
          if (eventType === "worker:stopped" || eventType === "worker:dead") {
            setState(produce((s) => {
              delete s.workers[data.worker.id];
              s.lastUpdate = Date.now();
            }));
          } else {
            setState(produce((s) => {
              s.workers[data.worker.id] = data.worker;
              s.lastUpdate = Date.now();
            }));
          }
        } catch (err) {
          console.error(`[sync] Failed to parse ${eventType}:`, err);
        }
      });
    }

    es.addEventListener("worker:stream", (event) => {
      try {
        const data = JSON.parse(event.data) as StreamEvent;
        if (!data?.chunk) return;
        setState(produce((s) => {
          s.streams = [...s.streams, data.chunk].slice(-maxStreams);
          s.lastUpdate = Date.now();
        }));
      } catch (err) {
        console.error("[sync] Failed to parse worker:stream:", err);
      }
    });

    return es;
  };

  // Connect on mount
  createEffect(() => {
    const es = connectSSE();

    onCleanup(() => {
      es.close();
    });
  });

  // Context value
  const value: SyncContextValue = {
    workers: () => Object.values(state.workers).sort((a, b) => a.id.localeCompare(b.id)),
    jobs: () => Object.values(state.jobs).sort((a, b) => b.startedAt - a.startedAt),
    streams: () => state.streams,
    connected: () => state.connected,
    demoMode: () => state.demoMode,

    refreshWorkers,
    refreshJobs,

    getWorker: (id) => state.workers[id],
    getJob: (id) => state.jobs[id],

    getWorkersByStatus: (status) =>
      Object.values(state.workers).filter((w) => w.status === status),

    getJobsForWorker: (workerId) =>
      Object.values(state.jobs)
        .filter((j) => j.workerId === workerId)
        .sort((a, b) => b.startedAt - a.startedAt),
  };

  return (
    <SyncContext.Provider value={value}>
      {props.children}
    </SyncContext.Provider>
  );
};

export function useSync(): SyncContextValue {
  const ctx = useContext(SyncContext);
  if (!ctx) {
    throw new Error("useSync must be used within a SyncProvider");
  }
  return ctx;
}
