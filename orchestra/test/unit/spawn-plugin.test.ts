import { describe, expect, test } from "bun:test";
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
});
