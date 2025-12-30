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

function emit(level: LogLevel, args: unknown[]) {
  if (!enabled) return;
  const message = args.map(formatArg).join(" ");
  pushLog(level, message);
  // Never emit to console - logs only go to internal buffer
}

export function setLoggerConfig(input: { bufferSize?: number; enabled?: boolean }) {
  if (typeof input.enabled === "boolean") {
    enabled = input.enabled;
  }
  if (typeof input.bufferSize === "number" && Number.isFinite(input.bufferSize) && input.bufferSize > 0) {
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
