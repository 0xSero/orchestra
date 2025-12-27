import type { WorkerInstance, WorkerProfile } from "../types";

/** Format a single line describing a running worker. */
export const formatWorkerLine = (worker: WorkerInstance): string => {
  const name = worker.profile.name ? ` (${worker.profile.name})` : "";
  const port = worker.port ? ` port=${worker.port}` : "";
  const status = worker.status ? ` status=${worker.status}` : "";
  return `- ${worker.profile.id}${name}${status}${port} model=${worker.profile.model}`;
};

/** Format a profile summary line with running state. */
export const formatProfileLine = (profile: WorkerProfile, running: boolean): string => {
  const state = running ? "running" : "idle";
  return `- ${profile.id} (${state}) model=${profile.model}`;
};

/** Return the first string in a flag value that may be a string or string list. */
export const pickFirstString = (value: string | string[] | undefined): string | undefined => {
  if (!value) return undefined;
  return Array.isArray(value) ? value[0] : value;
};

/** Clamp long text output to a fixed number of characters. */
export const truncateText = (input: string, maxChars = 600): string => {
  if (input.length <= maxChars) return input;
  return `${input.slice(0, Math.max(0, maxChars - 3))}...`;
};

/** Choose a short list of preferred worker IDs for the council demo. */
export const pickCouncilWorkers = (profiles: WorkerProfile[], limit = 3): string[] => {
  const preferred = ["product", "architect", "coder", "reviewer", "analyst", "docs", "qa"];
  const available = new Set(profiles.map((profile) => profile.id));
  const picked = preferred.filter((id) => available.has(id)).slice(0, limit);
  if (picked.length >= limit) return picked;

  const fallback = profiles.map((profile) => profile.id).filter((id) => !picked.includes(id));
  return [...picked, ...fallback].slice(0, limit);
};

/** Pick a worker ID to summarize council responses. */
export const pickSummaryWorkerId = (profiles: WorkerProfile[], candidates: string[]): string | undefined => {
  const byId = new Map(profiles.map((profile) => [profile.id, profile]));
  for (const id of candidates) {
    if (byId.has(id)) return id;
  }
  return profiles[0]?.id;
};

/** Build the status output for the orchestrator status command. */
export const buildStatusOutput = (input: {
  workers: WorkerInstance[];
  profiles: WorkerProfile[];
  autoSpawn: string[];
}): string => {
  const runningIds = new Set(input.workers.map((worker) => worker.profile.id));
  const lines: string[] = [];

  lines.push(`Workers: ${input.workers.length} running / ${input.profiles.length} profiles`);

  if (input.workers.length > 0) {
    lines.push("Running workers:");
    for (const worker of input.workers) {
      lines.push(formatWorkerLine(worker));
    }
  }

  if (input.profiles.length > 0) {
    lines.push("Profiles:");
    for (const profile of input.profiles) {
      lines.push(formatProfileLine(profile, runningIds.has(profile.id)));
    }
  }

  if (input.autoSpawn.length > 0) {
    lines.push(`Auto-spawn: ${input.autoSpawn.join(", ")}`);
  }

  return lines.join("\n");
};

/** Resolve a worker ID from parsed command arguments. */
export const pickWorkerId = (positional: string[], named: Record<string, string | string[]>): string | undefined => {
  const namedId = named.workerId ?? named.profileId ?? named.id;
  if (Array.isArray(namedId)) return namedId[0];
  if (typeof namedId === "string" && namedId.trim()) return namedId.trim();
  if (positional.length > 0) return positional[0];
  return undefined;
};
