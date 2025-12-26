import type { Plugin } from "@opencode-ai/plugin";
import { loadOrchestratorConfig } from "./config/orchestrator";
import { createCore } from "./core";

const GLOBAL_KEY = "__opencode_orchestra_core__";

type GlobalCoreState = {
  core?: ReturnType<typeof createCore>;
  hooks?: ReturnType<typeof createCore>["hooks"];
  startPromise?: Promise<void>;
  exitHandlersSet?: boolean;
};

const globalState = (globalThis as unknown as Record<string, GlobalCoreState>)[GLOBAL_KEY] ??= {};

export const OrchestratorPlugin: Plugin = async (ctx) => {
  if (process.env.OPENCODE_ORCHESTRATOR_WORKER === "1") {
    return {} as any;
  }

  if (globalState.hooks) {
    return globalState.hooks as any;
  }

  if (globalState.startPromise) {
    await globalState.startPromise;
    return (globalState.hooks ?? {}) as any;
  }

  globalState.startPromise = (async () => {
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
  return (globalState.hooks ?? {}) as any;
};

export default OrchestratorPlugin;
