import { workerJobs } from "../core/jobs";
import { logger } from "../core/logger";

export type MemoryTaskTurn = {
  role?: string;
  agent?: string;
  messageId?: string;
  summary: string;
  decisions?: string[];
  todos?: string[];
  entities?: string[];
};

export type MemoryTaskPayload = {
  type: "memory.task";
  taskId: string;
  sessionId?: string;
  projectId?: string;
  scope: "project" | "global";
  turn: MemoryTaskTurn;
};

type MemoryTaskRecord = {
  payload: MemoryTaskPayload;
  createdAt: number;
  storedKeys: string[];
  linkedKeys: Array<{ from: string; to: string; relation: string }>;
};

const tasks = new Map<string, MemoryTaskRecord>();
const MAX_TASKS = 200;
const MAX_TASK_AGE_MS = 6 * 60 * 60 * 1000;

function pruneTasks() {
  const now = Date.now();
  for (const [taskId, record] of tasks.entries()) {
    if (now - record.createdAt <= MAX_TASK_AGE_MS) continue;
    tasks.delete(taskId);
    workerJobs.setError(taskId, { error: "memory task expired" });
  }

  if (tasks.size <= MAX_TASKS) return;
  const entries = [...tasks.entries()].sort((a, b) => a[1].createdAt - b[1].createdAt);
  for (const [taskId] of entries) {
    if (tasks.size <= MAX_TASKS) break;
    tasks.delete(taskId);
    workerJobs.setError(taskId, { error: "memory task evicted" });
  }
}

export function createMemoryTask(input: Omit<MemoryTaskPayload, "taskId" | "type">): MemoryTaskPayload {
  const job = workerJobs.create({
    workerId: "memory",
    message: input.turn.summary,
    sessionId: input.sessionId,
    requestedBy: input.turn.agent,
  });

  const payload: MemoryTaskPayload = {
    type: "memory.task",
    taskId: job.id,
    sessionId: input.sessionId,
    projectId: input.projectId,
    scope: input.scope,
    turn: input.turn,
  };

  tasks.set(job.id, {
    payload,
    createdAt: Date.now(),
    storedKeys: [],
    linkedKeys: [],
  });
  pruneTasks();
  return payload;
}

export function getMemoryTask(taskId: string): MemoryTaskRecord | undefined {
  return tasks.get(taskId);
}

export function isMemoryTaskPending(taskId: string): boolean {
  return tasks.has(taskId);
}

export function recordMemoryPut(taskId: string, key: string) {
  const record = tasks.get(taskId);
  if (!record) return;
  if (!record.storedKeys.includes(key)) record.storedKeys.push(key);
}

export function recordMemoryLink(taskId: string, from: string, to: string, relation: string) {
  const record = tasks.get(taskId);
  if (!record) return;
  record.linkedKeys.push({ from, to, relation });
}

export function completeMemoryTask(taskId: string, input?: {
  summary?: string;
  storedKeys?: string[];
  linkedKeys?: Array<{ from: string; to: string; relation: string }>;
  notes?: string;
}): { ok: boolean; message: string } {
  const record = tasks.get(taskId);
  if (!record) {
    return { ok: false, message: `Unknown memory task "${taskId}"` };
  }

  const storedKeys = input?.storedKeys ?? record.storedKeys;
  const linkedKeys = input?.linkedKeys ?? record.linkedKeys;
  const summary =
    input?.summary ??
    (storedKeys.length > 0 ? `Stored ${storedKeys.length} memory entr${storedKeys.length === 1 ? "y" : "ies"}` : "Memory task completed");

  workerJobs.setResult(taskId, { responseText: summary });

  const details = [
    storedKeys.length ? `Stored keys: ${storedKeys.join(", ")}` : "",
    linkedKeys.length ? `Links: ${linkedKeys.map((l) => `${l.from} -> ${l.to} (${l.relation})`).join(", ")}` : "",
    input?.notes ?? "",
  ]
    .filter((line) => line.trim().length > 0)
    .join("\n");

  if (details) {
    workerJobs.attachReport(taskId, { summary, details });
  }

  tasks.delete(taskId);
  logger.info(`[memory] task ${taskId} completed`);
  return { ok: true, message: summary };
}

export function failMemoryTask(taskId: string, error: string): void {
  if (!tasks.has(taskId)) return;
  tasks.delete(taskId);
  workerJobs.setError(taskId, { error });
  logger.warn(`[memory] task ${taskId} failed: ${error}`);
}
