import { homedir } from "node:os";
import { join } from "node:path";

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asBooleanRecord(value: unknown): Record<string, boolean> | undefined {
  if (!isPlainObject(value)) return undefined;
  const out: Record<string, boolean> = {};
  for (const [k, v] of Object.entries(value)) {
    if (typeof v !== "boolean") return undefined;
    out[k] = v;
  }
  return out;
}

function asStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  if (value.every((v) => typeof v === "string")) return value;
  return undefined;
}

function deepMerge(base: Record<string, unknown>, override: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...base };
  for (const [k, v] of Object.entries(override)) {
    if (Array.isArray(v)) {
      out[k] = v;
    } else if (isPlainObject(v) && isPlainObject(out[k])) {
      out[k] = deepMerge(out[k] as Record<string, unknown>, v);
    } else {
      out[k] = v;
    }
  }
  return out;
}

function getUserConfigDir(): string {
  // Linux/macOS: respect XDG_CONFIG_HOME; Windows best-effort.
  if (process.platform === "win32") {
    return process.env.APPDATA || join(homedir(), "AppData", "Roaming");
  }
  return process.env.XDG_CONFIG_HOME || join(homedir(), ".config");
}

export { isPlainObject, asBooleanRecord, asStringArray, deepMerge, getUserConfigDir };
