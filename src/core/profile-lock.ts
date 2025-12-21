import { existsSync } from "node:fs";
import { readFile, unlink } from "node:fs/promises";
import { join } from "node:path";
import { writeJsonAtomic } from "../helpers/fs";
import { getUserConfigDir, sleep } from "../helpers/format";
import { isProcessAlive } from "../helpers/process";

function sanitizeKey(key: string): string {
  return key.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 120);
}

export function getWorkerProfileLockPath(profileId: string): string {
  return join(getUserConfigDir(), "opencode", "orchestrator-locks", `${sanitizeKey(profileId)}.lock.json`);
}

type LockFile = { pid: number; createdAt: number; updatedAt: number; key: string };

async function readLockFile(path: string): Promise<LockFile | undefined> {
  if (!existsSync(path)) return undefined;
  try {
    const raw = JSON.parse(await readFile(path, "utf8")) as Partial<LockFile>;
    if (typeof raw.pid !== "number") return undefined;
    if (typeof raw.createdAt !== "number") return undefined;
    if (typeof raw.updatedAt !== "number") return undefined;
    if (typeof raw.key !== "string") return undefined;
    return raw as LockFile;
  } catch {
    return undefined;
  }
}

async function writeLockFileAtomic(path: string, file: LockFile): Promise<void> {
  await writeJsonAtomic(path, file, { tmpPrefix: "opencode-orch-lock" });
}

export async function withWorkerProfileLock<T>(
  profileId: string,
  options: { timeoutMs?: number; pollMs?: number } | undefined,
  fn: () => Promise<T>
): Promise<T> {
  const lockPath = getWorkerProfileLockPath(profileId);
  const timeoutMs = options?.timeoutMs ?? 45_000;
  const maxAgeMs = Math.max(timeoutMs, 60_000);
  const pollMs = options?.pollMs ?? 75;
  const started = Date.now();

  while (true) {
    const now = Date.now();
    const existing = await readLockFile(lockPath);

    if (
      !existing ||
      !isProcessAlive(existing.pid, { treatEpermAsAlive: true }) ||
      now - existing.createdAt > maxAgeMs
    ) {
      await unlink(lockPath).catch(() => {});
      const next: LockFile = { pid: process.pid, createdAt: now, updatedAt: now, key: profileId };
      await writeLockFileAtomic(lockPath, next);

      const confirm = await readLockFile(lockPath);
      if (confirm?.pid === process.pid) {
        break;
      }
    } else {
      if (now - started > timeoutMs) {
        throw new Error(`Timed out waiting for worker profile lock "${profileId}" (held by pid ${existing.pid})`);
      }
      await sleep(pollMs);
    }
  }

  try {
    return await fn();
  } finally {
    const cur = await readLockFile(lockPath).catch(() => undefined);
    if (cur?.pid === process.pid) {
      await unlink(lockPath).catch(() => {});
    }
  }
}
