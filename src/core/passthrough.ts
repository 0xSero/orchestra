export type PassthroughState = {
  workerId: string;
  enabledAt: number;
  updatedAt: number;
};

const passthroughBySession = new Map<string, PassthroughState>();

export function getPassthrough(sessionId: string | undefined): PassthroughState | undefined {
  if (!sessionId) return undefined;
  return passthroughBySession.get(sessionId);
}

export function setPassthrough(sessionId: string, workerId: string): PassthroughState {
  const existing = passthroughBySession.get(sessionId);
  const next: PassthroughState = {
    workerId,
    enabledAt: existing?.enabledAt ?? Date.now(),
    updatedAt: Date.now(),
  };
  passthroughBySession.set(sessionId, next);
  return next;
}

export function clearPassthrough(sessionId: string): boolean {
  return passthroughBySession.delete(sessionId);
}

export function clearAllPassthrough(): void {
  passthroughBySession.clear();
}

export function isPassthroughExitMessage(text: string): boolean {
  const normalized = text.trim().toLowerCase();
  if (!normalized) return false;

  // Keep this intentionally strict to avoid accidental exits on normal text.
  const exact = new Set([
    "back",
    "exit docs mode",
    "exit docs",
    "stop docs",
    "exit passthrough",
    "exit passthrough mode",
    "stop passthrough",
    "disable passthrough",
  ]);

  return exact.has(normalized);
}

export function buildPassthroughSystemPrompt(workerId: string): string {
  return (
    `<orchestrator-passthrough enabled="true" worker="${workerId}">\n` +
    `You are in PASSTHROUGH mode.\n\n` +
    `Rules:\n` +
    `- If the incoming message contains "<orchestrator-internal", DO NOT passthrough. Handle it normally as the orchestrator.\n` +
    `- Otherwise, for every new user message, call ask_worker({ workerId: "${workerId}", message: <the user message>, attachments: <forward if present> }).\n` +
    `- Return ONLY the worker's answer.\n\n` +
    `Exit:\n` +
    `- If the user says "exit passthrough", "exit docs mode", or "back", stop passthrough and respond normally.\n` +
    `</orchestrator-passthrough>`
  );
}

