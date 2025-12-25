import type { Plugin } from "@opencode-ai/plugin";
import { loadOrchestratorConfig } from "./config/orchestrator";
import { createCore } from "./core";

export const OrchesorchetratorPlugin: Plugin = async (ctx) => {
  if (process.env.OPENCODE_ORCHESTRATOR_WORKER === "1") {
    return {} as any;
  }

  const { config } = await loadOrchestratorConfig({
    directory: ctx.directory,
    worktree: ctx.worktree || undefined,
  });

  const core = createCore({ config: { ctx, config }, deps: {} });
  await core.start();

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

  return core.hooks as any;
};
