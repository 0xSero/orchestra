import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { getDefaultGlobalOrchestratorConfigPath, getDefaultProjectOrchestratorConfigPath } from "../config/orchestrator";
import { isPlainObject } from "../helpers/format";
import type { OrchestratorConfigFile, WorkerProfile } from "../types";

export async function readOrchestratorConfigFile(path: string): Promise<OrchestratorConfigFile> {
  if (!existsSync(path)) return {};
  try {
    const raw = JSON.parse(await readFile(path, "utf8")) as unknown;
    if (!isPlainObject(raw)) return {};
    return raw as OrchestratorConfigFile;
  } catch {
    return {};
  }
}

export async function writeOrchestratorConfigFile(path: string, data: OrchestratorConfigFile): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(data, null, 2) + "\n", "utf8");
}

export function upsertProfileEntry(
  config: OrchestratorConfigFile,
  profileId: string,
  patch: Partial<WorkerProfile>
): OrchestratorConfigFile {
  const profiles = Array.isArray(config.profiles) ? [...config.profiles] : [];

  let found = false;
  for (let i = 0; i < profiles.length; i++) {
    const entry = profiles[i];
    if (typeof entry === "string") {
      if (entry === profileId) {
        profiles[i] = { id: profileId, ...patch } as WorkerProfile;
        found = true;
      }
      continue;
    }
    if (entry && typeof entry === "object" && "id" in entry && (entry as any).id === profileId) {
      profiles[i] = { ...(entry as WorkerProfile), ...patch, id: profileId };
      found = true;
    }
  }

  if (!found) profiles.push({ id: profileId, ...patch } as WorkerProfile);
  return { ...config, profiles };
}

export function setSpawnList(config: OrchestratorConfigFile, profileIds: string[]): OrchestratorConfigFile {
  return { ...config, workers: [...new Set(profileIds)] };
}

export function configPathForScope(scope: "global" | "project", directory: string): string {
  if (scope === "global") return getDefaultGlobalOrchestratorConfigPath();
  return getDefaultProjectOrchestratorConfigPath(directory);
}
