import type { OrchestratorContext } from "../context/orchestrator-context";

export async function injectSessionNotice(
  context: OrchestratorContext,
  sessionId: string,
  text: string,
): Promise<void> {
  if (!context.client?.session) return;
  if (context.config.ui?.wakeupInjection === false) return;
  try {
    await context.client.session.prompt({
      path: { id: sessionId },
      body: { noReply: true, parts: [{ type: "text", text }] as any },
      query: { directory: context.directory },
    } as any);
  } catch {
    // Ignore injection failures (session may have ended, etc.)
  }
}
