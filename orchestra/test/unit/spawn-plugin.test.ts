import { describe, expect, test } from "bun:test";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { normalizePluginPath, resolveWorkerBridgePluginPath } from "../../src/workers/spawn-plugin";

describe("spawn plugin helpers", () => {
  test("resolves worker bridge plugin path from env", () => {
    const original = process.env.OPENCODE_WORKER_PLUGIN_PATH;
    process.env.OPENCODE_WORKER_PLUGIN_PATH = "/tmp/plugin.mjs";
    try {
      expect(resolveWorkerBridgePluginPath()).toBe("/tmp/plugin.mjs");
    } finally {
      if (original) process.env.OPENCODE_WORKER_PLUGIN_PATH = original;
      else delete process.env.OPENCODE_WORKER_PLUGIN_PATH;
    }
  });

  test("normalizes file URLs and returns fallback on parse errors", () => {
    expect(normalizePluginPath("file:///tmp/plugin.mjs")).toBe("/tmp/plugin.mjs");
    expect(normalizePluginPath("file://%zz")).toBe("file://%zz");
  });

  test("resolves dist, parent, and repo plugin candidates", async () => {
    const originalEnv = process.env.OPENCODE_WORKER_PLUGIN_PATH;
    delete process.env.OPENCODE_WORKER_PLUGIN_PATH;

    const spawnPluginPath = fileURLToPath(new URL("../../src/workers/spawn-plugin.ts", import.meta.url));
    const baseDir = dirname(spawnPluginPath);
    const distCandidate = join(baseDir, "worker-bridge-plugin.mjs");
    const parentCandidate = join(baseDir, "..", "worker-bridge-plugin.mjs");
    const repoDir = join(process.cwd(), "scripts");
    const repoCandidate = join(repoDir, "worker-bridge-plugin.mjs");

    try {
      await writeFile(distCandidate, "export {}");
      expect(resolveWorkerBridgePluginPath()).toBe(distCandidate);
      await rm(distCandidate, { force: true });

      await writeFile(parentCandidate, "export {}");
      expect(resolveWorkerBridgePluginPath()).toBe(parentCandidate);
      await rm(parentCandidate, { force: true });

      await mkdir(repoDir, { recursive: true });
      await writeFile(repoCandidate, "export {}");
      expect(resolveWorkerBridgePluginPath()).toBe(repoCandidate);
    } finally {
      if (originalEnv) process.env.OPENCODE_WORKER_PLUGIN_PATH = originalEnv;
      else delete process.env.OPENCODE_WORKER_PLUGIN_PATH;
      await rm(distCandidate, { force: true }).catch(() => {});
      await rm(parentCandidate, { force: true }).catch(() => {});
      await rm(repoCandidate, { force: true }).catch(() => {});
    }
  });
});
