import { resolveOrchestratorEventsUrl } from "@/lib/opencode-base";
import { parseOrchestratorEvent } from "./opencode-helpers";
import type { OrchestratorEvent, OrchestratorEventType } from "./opencode-types";

const eventTypes: OrchestratorEventType[] = [
  "orchestra.worker.status",
  "orchestra.worker.stream",
  "orchestra.workflow.started",
  "orchestra.workflow.step",
  "orchestra.workflow.completed",
  "orchestra.memory.written",
  "orchestra.error",
];

export function subscribeToOrchestratorEvents(input: {
  url?: string;
  onEvent: (event: OrchestratorEvent) => void;
  onError?: (error: unknown) => void;
}): () => void {
  if (typeof EventSource === "undefined") return () => {};
  const resolvedUrl = input.url ?? resolveOrchestratorEventsUrl();
  if (!resolvedUrl) return () => {};

  const source = new EventSource(resolvedUrl);
  const handle = (evt: MessageEvent) => {
    if (!evt?.data) return;
    try {
      const parsed = JSON.parse(evt.data) as unknown;
      const event = parseOrchestratorEvent(parsed);
      if (event) input.onEvent(event);
    } catch {
      // ignore malformed events
    }
  };

  for (const type of eventTypes) {
    source.addEventListener(type, handle as EventListener);
  }
  source.onmessage = handle;
  source.onerror = (err) => {
    if (input.onError) input.onError(err);
  };

  return () => {
    source.close();
  };
}
