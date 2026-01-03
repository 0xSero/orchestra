import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { createWriteStream, existsSync } from "node:fs";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { onOrchestratorEvent } from "../../src/core/orchestrator-events";
import {
  getLogBuffer,
  setLoggerConfig,
  type LogEntry,
} from "../../src/core/logger";
import { workerPool } from "../../src/core/worker-pool";
import type { WorkerInstance } from "../../src/types";

const execFileAsync = promisify(execFile);

type WorkerTranscriptMeta = Record<
  string,
  {
    status: "recorded" | "skipped" | "error";
    reason?: string;
    messageCount?: number;
    toolParts?: number;
  }
>;

export type RunSummaryWorker = {
  messages: { total: number };
  parts: { total: number; byType: Record<string, number> };
  tools: { total: number; byToolId: Record<string, number> };
};

export type RunSummary = {
  workflowId: string | null;
  testName: string;
  startedAt: number;
  finishedAt: number;
  durationMs: number;
  events: { total: number; byType: Record<string, number> };
  logs: { total: number; warn: number; error: number };
  workers: { total: number; byId: Record<string, RunSummaryWorker> };
  errors: { total: number; events: number; logs: number };
  warnings: { total: number; events: number; logs: number };
};

export type RunSummaryInput = {
  runDir: string;
  workflowId: string | null;
  testName: string;
  startedAt: number;
  finishedAt: number;
};

export type RunRecorderOptions = {
  workflowId: string | null;
  testName: string;
  runRoot?: string;
  directory?: string;
  model?: string;
  messageLimit?: number;
  listWorkers?: () => Iterable<WorkerInstance>;
};

export type RunRecorder = {
  runDir: string;
  eventsPath: string;
  logPath: string;
  metaPath: string;
  summaryPath: string;
  finalize: () => Promise<void>;
};

const sanitizeId = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return "run";
  return trimmed.replace(/[^a-zA-Z0-9._-]+/g, "-");
};

const formatTimestamp = (value: number) =>
  new Date(value).toISOString().replace(/[:]/g, "-");

const readOutput = (value: string | Buffer) =>
  typeof value === "string" ? value : value.toString("utf8");

const resolveGitInfo = async (cwd: string) => {
  try {
    const [shaRes, branchRes] = await Promise.all([
      execFileAsync("git", ["rev-parse", "HEAD"], { cwd }),
      execFileAsync("git", ["rev-parse", "--abbrev-ref", "HEAD"], { cwd }),
    ]);
    const sha = readOutput(shaRes.stdout).trim();
    const branch = readOutput(branchRes.stdout).trim();
    return {
      sha: sha.length > 0 ? sha : undefined,
      branch: branch.length > 0 ? branch : undefined,
    };
  } catch {
    return {};
  }
};

const collectEnv = () => {
  const entries = Object.entries(process.env).filter(([key, value]) => {
    if (!value || value.length === 0) return false;
    const isOrch =
      key.startsWith("OPENCODE_ORCH") ||
      key.startsWith("OPENCODE_ORCHESTRATOR");
    if (!isOrch) return false;
    if (key.includes("TOKEN") || key.includes("SECRET") || key.includes("KEY"))
      return false;
    return true;
  });
  return Object.fromEntries(entries);
};

const readJsonLines = async (path: string): Promise<unknown[]> => {
  if (!existsSync(path)) return [];
  const raw = await readFile(path, "utf8");
  const lines = raw
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  return lines.map((line) => JSON.parse(line));
};

const readJsonFile = async (path: string): Promise<unknown> => {
  if (!existsSync(path)) return undefined;
  const raw = await readFile(path, "utf8");
  if (raw.trim().length === 0) return undefined;
  return JSON.parse(raw);
};

const resolveMessageLimit = (limit?: number) => {
  if (typeof limit !== "number") return 200;
  if (!Number.isFinite(limit)) return 200;
  if (limit <= 0) return 200;
  return Math.floor(limit);
};

const countToolParts = (message: any): number => {
  const parts = Array.isArray(message?.parts) ? message.parts : [];
  return parts.filter((part: any) => part?.type === "tool").length;
};

const resolvePartType = (part: any): string => {
  if (part && typeof part.type === "string" && part.type.length > 0) {
    return part.type;
  }
  return "unknown";
};

const resolveToolId = (part: any): string => {
  const toolId =
    typeof part?.tool === "string"
      ? part.tool
      : typeof part?.name === "string"
        ? part.name
        : typeof part?.toolId === "string"
          ? part.toolId
          : "";
  return toolId.length > 0 ? toolId : "unknown";
};

const extractWorkerId = (event: any): string | undefined => {
  if (typeof event?.data?.workerId === "string") return event.data.workerId;
  if (typeof event?.data?.chunk?.workerId === "string")
    return event.data.chunk.workerId;
  if (typeof event?.data?.worker?.id === "string") return event.data.worker.id;
  return undefined;
};

const createEmptyWorkerSummary = (): RunSummaryWorker => ({
  messages: { total: 0 },
  parts: { total: 0, byType: {} },
  tools: { total: 0, byToolId: {} },
});

const buildWorkerMap = (listWorkers?: () => Iterable<WorkerInstance>) => {
  const map = new Map<string, WorkerInstance>();
  const iterable = listWorkers ? listWorkers() : workerPool.workers.values();
  for (const worker of iterable) {
    if (worker?.profile?.id) map.set(worker.profile.id, worker);
  }
  return map;
};

const writeWorkerMessages = async (input: {
  runDir: string;
  directory: string;
  workerIds: Set<string>;
  messageLimit?: number;
  listWorkers?: () => Iterable<WorkerInstance>;
}): Promise<WorkerTranscriptMeta> => {
  const workerMap = buildWorkerMap(input.listWorkers);
  const workerIds = new Set<string>([...workerMap.keys(), ...input.workerIds]);
  const meta: WorkerTranscriptMeta = {};

  for (const workerId of workerIds) {
    const worker = workerMap.get(workerId);
    if (!worker) {
      meta[workerId] = { status: "skipped", reason: "worker_not_found" };
      continue;
    }
    if (!worker.client || !worker.sessionId) {
      meta[workerId] = { status: "skipped", reason: "missing_session" };
      continue;
    }
    const directory = worker.directory ?? input.directory;
    try {
      const limit = resolveMessageLimit(input.messageLimit);
      const res = await worker.client.session.messages({
        path: { id: worker.sessionId },
        query: { directory, limit },
      });
      const data = (res as any)?.data ?? res;
      const list = Array.isArray(data) ? data : [];
      const workerDir = join(input.runDir, "workers", workerId);
      await mkdir(workerDir, { recursive: true });
      await writeFile(
        join(workerDir, "messages.json"),
        JSON.stringify(list, null, 2),
      );
      const messageCount = list.length;
      const toolCount = list.reduce(
        (sum: number, msg: any) => sum + countToolParts(msg),
        0,
      );
      meta[workerId] = {
        status: "recorded",
        messageCount,
        toolParts: toolCount,
      };
    } catch (error) {
      meta[workerId] = {
        status: "error",
        reason: error instanceof Error ? error.message : String(error),
      };
    }
  }

  return meta;
};

const countLogLevels = (entries: LogEntry[]) => {
  let warn = 0;
  let error = 0;
  for (const entry of entries) {
    if (entry.level === "warn") warn += 1;
    if (entry.level === "error") error += 1;
  }
  return { total: entries.length, warn, error };
};

const summarizeWorkerMessages = async (
  runDir: string,
  workerIdsFromEvents: Set<string>,
): Promise<Record<string, RunSummaryWorker>> => {
  const workersDir = join(runDir, "workers");
  const byId: Record<string, RunSummaryWorker> = {};
  const workerIds = new Set<string>(workerIdsFromEvents);

  if (existsSync(workersDir)) {
    const entries = await readdir(workersDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      workerIds.add(entry.name);
    }
  }

  for (const workerId of workerIds) {
    const summary = createEmptyWorkerSummary();
    const messagesPath = join(workersDir, workerId, "messages.json");
    const data = await readJsonFile(messagesPath);
    const messages = Array.isArray(data) ? data : [];
    summary.messages.total = messages.length;
    for (const message of messages) {
      const parts = Array.isArray((message as any)?.parts)
        ? (message as any).parts
        : [];
      summary.parts.total += parts.length;
      for (const part of parts) {
        const type = resolvePartType(part);
        summary.parts.byType[type] = (summary.parts.byType[type] ?? 0) + 1;
        if (type === "tool") {
          const toolId = resolveToolId(part);
          summary.tools.total += 1;
          summary.tools.byToolId[toolId] =
            (summary.tools.byToolId[toolId] ?? 0) + 1;
        }
      }
    }
    byId[workerId] = summary;
  }

  return byId;
};

const countEventWarnings = (event: any): number => {
  if (event?.type === "orchestra.workflow.step" && event?.data?.warning)
    return 1;
  if (event?.type === "orchestra.worker.status" && event?.data?.worker?.warning)
    return 1;
  return 0;
};

const countEventErrors = (event: any): number => {
  if (event?.type === "orchestra.error") return 1;
  if (
    event?.type === "orchestra.workflow.step" &&
    event?.data?.status === "error"
  )
    return 1;
  if (
    event?.type === "orchestra.workflow.completed" &&
    event?.data?.status === "error"
  )
    return 1;
  if (event?.type === "orchestra.worker.status" && event?.data?.worker?.error)
    return 1;
  return 0;
};

export const buildRunSummary = async (
  input: RunSummaryInput,
): Promise<RunSummary> => {
  const eventsPath = join(input.runDir, "events.jsonl");
  const logPath = join(input.runDir, "orchestrator.log.jsonl");
  const events = await readJsonLines(eventsPath);
  const logEntriesRaw = await readJsonLines(logPath);
  const logEntries = logEntriesRaw.filter(
    (entry): entry is LogEntry =>
      !!entry &&
      typeof (entry as LogEntry).level === "string" &&
      typeof (entry as LogEntry).message === "string" &&
      typeof (entry as LogEntry).at === "number",
  );

  const eventsByType: Record<string, number> = {};
  const workerIdsFromEvents = new Set<string>();
  let eventWarnings = 0;
  let eventErrors = 0;

  for (const event of events) {
    const rawType = (event as any)?.type;
    const type = typeof rawType === "string" ? rawType : "unknown";
    eventsByType[type] = (eventsByType[type] ?? 0) + 1;
    const workerId = extractWorkerId(event);
    if (workerId) workerIdsFromEvents.add(workerId);
    eventWarnings += countEventWarnings(event);
    eventErrors += countEventErrors(event);
  }

  const logCounts = countLogLevels(logEntries);
  const workersById = await summarizeWorkerMessages(
    input.runDir,
    workerIdsFromEvents,
  );

  const warnings = { events: eventWarnings, logs: logCounts.warn };
  const errors = { events: eventErrors, logs: logCounts.error };

  return {
    workflowId: input.workflowId,
    testName: input.testName,
    startedAt: input.startedAt,
    finishedAt: input.finishedAt,
    durationMs: Math.max(0, input.finishedAt - input.startedAt),
    events: { total: events.length, byType: eventsByType },
    logs: logCounts,
    workers: {
      total: Object.keys(workersById).length,
      byId: workersById,
    },
    warnings: {
      total: warnings.events + warnings.logs,
      events: warnings.events,
      logs: warnings.logs,
    },
    errors: {
      total: errors.events + errors.logs,
      events: errors.events,
      logs: errors.logs,
    },
  };
};

export const startRunRecorder = async (
  options: RunRecorderOptions,
): Promise<RunRecorder> => {
  const startedAt = Date.now();
  const runRoot = options.runRoot ?? join(process.cwd(), "test-runs");
  const label = options.workflowId ?? options.testName;
  const safeWorkflow = sanitizeId(label);
  const runTimestamp = formatTimestamp(startedAt);
  const runDir = join(runRoot, `run-${safeWorkflow}-${runTimestamp}`);
  const workersDir = join(runDir, "workers");
  await mkdir(workersDir, { recursive: true });

  setLoggerConfig({ enabled: true });

  const eventsPath = join(runDir, "events.jsonl");
  const logPath = join(runDir, "orchestrator.log.jsonl");
  const metaPath = join(runDir, "meta.json");
  const summaryPath = join(runDir, "summary.json");
  const eventsStream = createWriteStream(eventsPath, { encoding: "utf8" });

  const seenWorkers = new Set<string>();

  const off = onOrchestratorEvent((event) => {
    const workerId = extractWorkerId(event);
    if (workerId) seenWorkers.add(workerId);
    eventsStream.write(`${JSON.stringify(event)}\n`);
  });

  const logStartSize = getLogBuffer().length;

  const finalize = async () => {
    const finishedAt = Date.now();
    off();
    await new Promise<void>((resolve, reject) => {
      eventsStream.on("error", reject);
      eventsStream.end(() => resolve());
    });

    const logEntries = getLogBuffer();
    const logs =
      logEntries.length >= logStartSize
        ? logEntries.slice(logStartSize)
        : logEntries;
    const logLines = logs.map((entry) => JSON.stringify(entry)).join("\n");
    await writeFile(logPath, logLines.length > 0 ? `${logLines}\n` : "");

    const workerMeta = await writeWorkerMessages({
      runDir,
      directory: options.directory ?? process.cwd(),
      workerIds: seenWorkers,
      messageLimit: options.messageLimit,
      listWorkers: options.listWorkers,
    });

    const summary = await buildRunSummary({
      runDir,
      workflowId: options.workflowId,
      testName: options.testName,
      startedAt,
      finishedAt,
    });
    await writeFile(summaryPath, JSON.stringify(summary, null, 2));

    const meta = {
      testName: options.testName,
      workflowId: options.workflowId,
      runTimestamp,
      startedAt,
      finishedAt,
      cwd: process.cwd(),
      model: options.model ?? process.env.OPENCODE_ORCH_E2E_MODEL,
      messageLimit: resolveMessageLimit(options.messageLimit),
      git: await resolveGitInfo(process.cwd()),
      env: collectEnv(),
      workers: workerMeta,
    };

    await writeFile(metaPath, JSON.stringify(meta, null, 2));
  };

  return {
    runDir,
    eventsPath,
    logPath,
    metaPath,
    summaryPath,
    finalize,
  };
};
