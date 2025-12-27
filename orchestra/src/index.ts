import type { Hooks, Plugin } from "@opencode-ai/plugin";
import { loadOrchestratorConfig } from "./config/orchestrator";
import { createCore } from "./core";
import { cleanupStaleWorkers } from "./workers/pid-tracker";

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
    // Clean up any stale workers from previous crashed sessions
    const cleanup = await cleanupStaleWorkers();
    if (cleanup.killed.length > 0) {
      console.log(`[Orchestra] Cleaned up ${cleanup.killed.length} stale worker(s): ${cleanup.killed.join(", ")}`);
    }

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
