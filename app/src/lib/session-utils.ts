import type { Session, WorkerRuntime } from "@/context/opencode";

export type SessionStatus = "ready" | "busy" | "error" | "stopped" | "starting";

/** Format a duration in human-friendly units. */
export const formatDuration = (startTime: number): string => {
  const now = Date.now();
  const diff = now - startTime;

  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
};

/** Resolve session status using worker state and recent activity. */
export const getSessionStatus = (session?: Session, worker?: WorkerRuntime): SessionStatus => {
  if (worker) {
    if (worker.status === "busy") return "busy";
    if (worker.status === "ready") return "ready";
    if (worker.status === "error") return "error";
    if (worker.status === "starting") return "starting";
    return "stopped";
  }

  if (!session) return "stopped";

  if (session.time?.compacting) return "busy";

  const now = Date.now();
  const lastUpdate = session.time?.updated || 0;
  const timeSinceUpdate = now - lastUpdate;

  if (timeSinceUpdate < 30000) {
    return "busy";
  }

  return "ready";
};

/** Map a session status to its UI label. */
export const getStatusLabel = (status: SessionStatus): string => {
  switch (status) {
    case "ready":
      return "Idle";
    case "busy":
      return "Running";
    case "error":
      return "Error";
    case "starting":
      return "Starting";
    default:
      return "Stopped";
  }
};

const mapWorkersBySession = (workers: WorkerRuntime[]): Map<string, WorkerRuntime> => {
  const map = new Map<string, WorkerRuntime>();
  for (const worker of workers) {
    if (worker.sessionId) {
      map.set(worker.sessionId, worker);
    }
  }
  return map;
};

/** Count sessions that are currently active or starting. */
export const countActiveSessions = (sessions: Session[], workers: WorkerRuntime[]): number => {
  const workerBySession = mapWorkersBySession(workers);
  let active = 0;
  for (const session of sessions) {
    const status = getSessionStatus(session, workerBySession.get(session.id));
    if (status === "busy" || status === "starting") active += 1;
  }
  return active;
};
