import { EventEmitter } from "node:events";
import type { Factory, ServiceLifecycle } from "../types";
import type { ApiService } from "../api";
import type { OrchestraEvent, OrchestraEventMap, OrchestraEventMeta, OrchestraEventName } from "./events";

export type CommunicationConfig = {
  maxListeners?: number;
  enableSdkEvents?: boolean;
};

export type CommunicationDeps = {
  api: ApiService;
};

export type CommunicationService = ServiceLifecycle & {
  emit: <T extends OrchestraEventName>(type: T, data: OrchestraEventMap[T], meta: OrchestraEventMeta) => void;
  on: <T extends OrchestraEventName>(type: T, handler: (event: OrchestraEvent<T>) => void) => () => void;
  off: <T extends OrchestraEventName>(type: T, handler: (event: OrchestraEvent<T>) => void) => void;
};

export const createCommunication: Factory<CommunicationConfig, CommunicationDeps, CommunicationService> = ({
  config,
  deps,
}) => {
  const emitter = new EventEmitter();
  emitter.setMaxListeners(config.maxListeners ?? 50);
  const enableSdkEvents = config.enableSdkEvents !== false;

  let abortController: AbortController | undefined;
  let streamTask: Promise<void> | undefined;

  // Forward orchestra events to the SSE stream for frontend visibility
  const forwardToSse = <T extends OrchestraEventName>(type: T, data: OrchestraEventMap[T], meta: OrchestraEventMeta) => {
    // Forward worker events, orchestrator lifecycle, and model events
    if (
      type.startsWith("orchestra.worker.") ||
      type.startsWith("orchestra.model.") ||
      type === "orchestra.started" ||
      type.startsWith("skill.")
    ) {
      deps.api.tui.publish({
        body: {
          type: "orchestra.event",
          payload: { type, data, meta },
        },
      }).catch(() => {});
    }
  };

  const emit = <T extends OrchestraEventName>(type: T, data: OrchestraEventMap[T], meta: OrchestraEventMeta) => {
    emitter.emit(type, { type, data, meta } satisfies OrchestraEvent<T>);
    forwardToSse(type, data, meta);
  };

  const on = <T extends OrchestraEventName>(type: T, handler: (event: OrchestraEvent<T>) => void) => {
    emitter.on(type, handler as any);
    return () => emitter.off(type, handler as any);
  };

  const off = <T extends OrchestraEventName>(type: T, handler: (event: OrchestraEvent<T>) => void) => {
    emitter.off(type, handler as any);
  };

  return {
    emit,
    on,
    off,
    start: async () => {
      console.log("[Communication] start called, enableSdkEvents:", enableSdkEvents);
      if (!enableSdkEvents) return;
      if (abortController) return;
      abortController = new AbortController();

      try {
        console.log("[Communication] subscribing to events...");
        const result = await deps.api.event.subscribe({ signal: abortController.signal } as any);
        console.log("[Communication] event subscription established");
        streamTask = (async () => {
          try {
            for await (const event of result.stream) {
              emit("orchestra.server.event", { event }, { source: "sdk" });
            }
          } catch {
            // ignore stream errors
          }
        })();
      } catch (err) {
        console.log("[Communication] event subscription failed (non-fatal):", err);
        abortController = undefined;
      }
    },
    stop: async () => {
      abortController?.abort();
      abortController = undefined;
      if (streamTask) {
        await streamTask.catch(() => {});
        streamTask = undefined;
      }
      emitter.removeAllListeners();
    },
    health: async () => ({ ok: true }),
  };
};
