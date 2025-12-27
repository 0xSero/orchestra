import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/** Locate the worker-bridge plugin path from env, dist, or repo scripts. */
export const resolveWorkerBridgePluginPath = (): string | undefined => {
  if (process.env.OPENCODE_WORKER_PLUGIN_PATH) return process.env.OPENCODE_WORKER_PLUGIN_PATH;

  try {
    const baseDir = dirname(fileURLToPath(import.meta.url));
    const distCandidate = join(baseDir, "worker-bridge-plugin.mjs");
    if (existsSync(distCandidate)) return distCandidate;
    const parentCandidate = join(baseDir, "..", "worker-bridge-plugin.mjs");
    if (existsSync(parentCandidate)) return parentCandidate;
  } catch {
    // ignore path resolution issues
  }

  const repoCandidate = join(process.cwd(), "scripts", "worker-bridge-plugin.mjs");
  if (existsSync(repoCandidate)) return repoCandidate;

  return undefined;
};

/** Normalize file:// URLs to filesystem paths when needed. */
export const normalizePluginPath = (path: string | undefined): string | undefined => {
  if (!path) return undefined;
  if (!path.startsWith("file://")) return path;
  try {
    return fileURLToPath(path);
  } catch {
    return path;
  }
};
