import { appendFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { inspect } from "node:util";

export type LogLevel = "debug" | "info" | "warn" | "error";

export type LogEntry = {
  at: number;
  level: LogLevel;
  message: string;
};

const entries: LogEntry[] = [];
let bufferSize = 200;
let enabled = false;
let logFilePath: string | undefined;

async function initLogFile() {
  if (logFilePath) return;
  const filePath = process.env.LOG_FILE;
  if (!filePath) return;
  try {
    const dir = dirname(filePath);
    await mkdir(dir, { recursive: true });
    logFilePath = filePath;
  } catch {
  }
}

function formatArg(arg: unknown): string {
  if (typeof arg === "string") return arg;
  try {
    return inspect(arg, { depth: 3, breakLength: 120 });
  } catch {
    return String(arg);
  }
}

function pushLog(level: LogLevel, message: string) {
  if (!enabled) return;
  entries.push({ at: Date.now(), level, message });
  if (entries.length > bufferSize) {
    entries.splice(0, entries.length - bufferSize);
  }
}

async function writeToFile(level: LogLevel, message: string) {
  if (!logFilePath) return;
  try {
    const logLine = JSON.stringify({ at: Date.now(), level, message }) + "\n";
    await appendFile(logFilePath, logLine, { encoding: "utf8" });
  } catch {
  }
}

function emit(level: LogLevel, args: unknown[]) {
  if (!enabled) return;
  const message = args.map(formatArg).join(" ");
  pushLog(level, message);
  writeToFile(level, message).catch(() => {});
}

export function setLoggerConfig(input: {
  bufferSize?: number;
  enabled?: boolean;
}) {
  if (typeof input.enabled === "boolean") {
    enabled = input.enabled;
  }
  if (
    typeof input.bufferSize === "number" &&
    Number.isFinite(input.bufferSize) &&
    input.bufferSize > 0
  ) {
    bufferSize = Math.floor(input.bufferSize);
  }
}

export function getLogBuffer(limit?: number): LogEntry[] {
  if (!enabled) return [];
  if (typeof limit === "number" && Number.isFinite(limit) && limit > 0) {
    return entries.slice(-Math.floor(limit));
  }
  return [...entries];
}

export const logger = {
  debug: (...args: unknown[]) => emit("debug", args),
  info: (...args: unknown[]) => emit("info", args),
  warn: (...args: unknown[]) => emit("warn", args),
  error: (...args: unknown[]) => emit("error", args),
};

initLogFile().catch(() => {});
