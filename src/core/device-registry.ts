/**
 * Device Registry - Backwards compatibility layer
 *
 * The device registry functionality has been consolidated into worker-pool.ts.
 * This file provides the same exports for backwards compatibility.
 *
 * @deprecated Import from "./worker-pool" for new code
 */

import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { writeJsonAtomic } from "../helpers/fs";
import { getUserConfigDir } from "../helpers/format";
import { isProcessAlive } from "../helpers/process";

// Types remain the same for compatibility
export type DeviceRegistryWorkerEntry = {
  kind: "worker";
  orchestratorInstanceId: string;
  hostPid?: number;
  workerId: string;
  pid: number;
  url?: string;
  port?: number;
  sessionId?: string;
  status: "starting" | "ready" | "busy" | "error" | "stopped";
  startedAt: number;
  updatedAt: number;
  lastError?: string;
};

export type DeviceRegistrySessionEntry = {
  kind: "session";
  hostPid: number;
  sessionId: string;
  directory: string;
  title: string;
  createdAt: number;
  updatedAt: number;
};

export type DeviceRegistryEntry = DeviceRegistryWorkerEntry | DeviceRegistrySessionEntry;

type DeviceRegistryFile = {
  version: 1;
  updatedAt: number;
  entries: DeviceRegistryEntry[];
};

export function getDeviceRegistryPath(): string {
  return join(getUserConfigDir(), "opencode", "orchestrator-device-registry.json");
}

async function readRegistryFile(path: string): Promise<DeviceRegistryFile> {
  if (!existsSync(path)) {
    return { version: 1, updatedAt: Date.now(), entries: [] };
  }
  try {
    const raw = JSON.parse(await readFile(path, "utf8")) as Partial<DeviceRegistryFile>;
    const entries = Array.isArray(raw.entries) ? (raw.entries as DeviceRegistryEntry[]) : [];
    return {
      version: 1,
      updatedAt: typeof raw.updatedAt === "number" ? raw.updatedAt : Date.now(),
      entries,
    };
  } catch {
    return { version: 1, updatedAt: Date.now(), entries: [] };
  }
}

async function writeRegistryFile(path: string, file: DeviceRegistryFile): Promise<void> {
  await writeJsonAtomic(path, file, { tmpPrefix: "opencode-orch-registry" });
}

export async function pruneDeadEntries(path = getDeviceRegistryPath()): Promise<void> {
  const file = await readRegistryFile(path);
  const alive = file.entries.filter((e) => {
    if (e.kind === "worker") return isProcessAlive(e.pid);
    if (e.kind === "session") return isProcessAlive(e.hostPid);
    return true;
  });
  if (alive.length === file.entries.length) return;
  await writeRegistryFile(path, { version: 1, updatedAt: Date.now(), entries: alive });
}

export async function upsertWorkerEntry(
  entry: Omit<DeviceRegistryWorkerEntry, "kind" | "updatedAt">,
  path = getDeviceRegistryPath()
): Promise<void> {
  const file = await readRegistryFile(path);
  const now = Date.now();
  const next: DeviceRegistryWorkerEntry = { kind: "worker", updatedAt: now, ...entry };
  const idx = file.entries.findIndex(
    (e) =>
      e.kind === "worker" &&
      e.orchestratorInstanceId === entry.orchestratorInstanceId &&
      e.workerId === entry.workerId &&
      e.pid === entry.pid
  );
  const entries = [...file.entries];
  if (idx >= 0) entries[idx] = next;
  else entries.push(next);
  await writeRegistryFile(path, { version: 1, updatedAt: now, entries });
}

export async function removeWorkerEntriesByPid(pid: number, path = getDeviceRegistryPath()): Promise<void> {
  const file = await readRegistryFile(path);
  const entries = file.entries.filter((e) => !(e.kind === "worker" && e.pid === pid));
  if (entries.length === file.entries.length) return;
  await writeRegistryFile(path, { version: 1, updatedAt: Date.now(), entries });
}

export async function upsertSessionEntry(
  entry: Omit<DeviceRegistrySessionEntry, "kind" | "updatedAt">,
  path = getDeviceRegistryPath()
): Promise<void> {
  const file = await readRegistryFile(path);
  const now = Date.now();
  const next: DeviceRegistrySessionEntry = { kind: "session", updatedAt: now, ...entry };
  const idx = file.entries.findIndex((e) => e.kind === "session" && e.hostPid === entry.hostPid && e.sessionId === entry.sessionId);
  const entries = [...file.entries];
  if (idx >= 0) entries[idx] = next;
  else entries.push(next);
  await writeRegistryFile(path, { version: 1, updatedAt: now, entries });
}

export async function removeSessionEntry(sessionId: string, hostPid: number, path = getDeviceRegistryPath()): Promise<void> {
  const file = await readRegistryFile(path);
  const entries = file.entries.filter((e) => !(e.kind === "session" && e.hostPid === hostPid && e.sessionId === sessionId));
  if (entries.length === file.entries.length) return;
  await writeRegistryFile(path, { version: 1, updatedAt: Date.now(), entries });
}

export async function listDeviceRegistry(path = getDeviceRegistryPath()): Promise<DeviceRegistryEntry[]> {
  await pruneDeadEntries(path).catch(() => {});
  const file = await readRegistryFile(path);
  return file.entries;
}
