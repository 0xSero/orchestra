import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Hooks, Plugin } from "@opencode-ai/plugin";
import { loadOrchestratorConfig } from "./config/orchestrator";
import { createCore } from "./core";
import { cleanupStaleWorkers } from "./workers/pid-tracker";

/** Load .env file from a directory into process.env (silent, no overwrites). */
function loadEnvFile(directory: string): void {
  const envPath = join(directory, ".env");
  if (!existsSync(envPath)) return;
  try {
    const content = readFileSync(envPath, "utf8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIndex = trimmed.indexOf("=");
      if (eqIndex === -1) continue;
      const key = trimmed.slice(0, eqIndex).trim();
      let value = trimmed.slice(eqIndex + 1).trim();
      // Remove quotes if present
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      // Don't overwrite existing env vars
      if (key && process.env[key] === undefined) {
        process.env[key] = value;
      }
    }
  } catch {
    // Silently ignore .env load failures
  }
}

const GLOBAL_KEY = "__opencode_orchestra_core__";

type GlobalCoreState = {
  core?: ReturnType<typeof createCore>;
  hooks?: Hooks;
  startPromise?: Promise<void>;
  exitHandlersSet?: boolean;
};

const globalStore = globalThis as unknown as Record<string, GlobalCoreState | undefined>;
const existingState = globalStore[GLOBAL_KEY];
const globalState = existingState ?? {};
if (existingState === undefined || existingState === null) {
  globalStore[GLOBAL_KEY] = globalState;
}

export const OrchestratorPlugin: Plugin = async (ctx) => {
  // Load .env from project directory (before any other initialization)
  loadEnvFile(ctx.directory);

  if (process.env.OPENCODE_ORCHESTRATOR_WORKER === "1") {
    return {};
  }

  if (globalState.hooks) {
    return globalState.hooks;
  }

  if (globalState.startPromise) {
    await globalState.startPromise;
    return globalState.hooks ?? {};
  }

  globalState.startPromise = (async () => {
    // Clean up stale worker entries from previous sessions (silent)
    await cleanupStaleWorkers();

    const { config } = await loadOrchestratorConfig({
      directory: ctx.directory,
      worktree: ctx.worktree || undefined,
    });
    const core = createCore({ config: { ctx, config }, deps: {} });
    await core.start();
    globalState.core = core;
    globalState.hooks = core.hooks;

    if (!globalState.exitHandlersSet) {
      globalState.exitHandlersSet = true;
      const onExit = async () => {
        await core.stop().catch(() => {});
      };
      process.once("beforeExit", () => {
        void onExit();
      });
      process.once("SIGINT", () => {
        void onExit();
        process.exit(130);
      });
      process.once("SIGTERM", () => {
        void onExit();
        process.exit(143);
      });
    }
  })();

  await globalState.startPromise;
  return globalState.hooks ?? {};
};

export default OrchestratorPlugin;
export { createCommandRouter } from "./commands";
