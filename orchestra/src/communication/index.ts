import { EventEmitter } from "node:events";
import type { Event as OpenCodeEvent } from "@opencode-ai/sdk";
import type { ApiService } from "../api";
import type { Factory, ServiceLifecycle } from "../types";
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

  type AnyOrchestraEventHandler = (event: OrchestraEvent<OrchestraEventName>) => void;
  type EventStreamResult = {
    stream: AsyncGenerator<OpenCodeEvent, unknown, unknown>;
  };

  let abortController: AbortController | undefined;
  let streamTask: Promise<void> | undefined;

  // Forward orchestra events to the SSE stream for frontend visibility
  const forwardToSse = <T extends OrchestraEventName>(
    type: T,
    data: OrchestraEventMap[T],
    meta: OrchestraEventMeta,
  ) => {
    // Forward worker events, session events, orchestrator lifecycle, and model events
    if (
      type.startsWith("orchestra.worker.") ||
      type.startsWith("orchestra.session.") ||
      type.startsWith("orchestra.subagent.") ||
      type.startsWith("orchestra.model.") ||
      type === "orchestra.started" ||
      type.startsWith("skill.")
    ) {
      deps.api.tui
        .publish({
          body: {
            type: "orchestra.event",
            payload: { type, data, meta },
          },
        })
        .catch(() => {});
    }
  };

  const emit = <T extends OrchestraEventName>(type: T, data: OrchestraEventMap[T], meta: OrchestraEventMeta) => {
    emitter.emit(type, { type, data, meta } satisfies OrchestraEvent<T>);
    forwardToSse(type, data, meta);
  };

  const on = <T extends OrchestraEventName>(type: T, handler: (event: OrchestraEvent<T>) => void) => {
    emitter.on(type, handler as AnyOrchestraEventHandler);
    return () => emitter.off(type, handler as AnyOrchestraEventHandler);
  };

  const off = <T extends OrchestraEventName>(type: T, handler: (event: OrchestraEvent<T>) => void) => {
    emitter.off(type, handler as AnyOrchestraEventHandler);
  };

  return {
    emit,
    on,
    off,
    start: async () => {
      if (!enableSdkEvents) return;
      if (abortController) return;
      abortController = new AbortController();

      try {
        const result = (await deps.api.event.subscribe({ signal: abortController.signal })) as EventStreamResult;
        streamTask = (async () => {
          try {
            for await (const event of result.stream) {
              emit("orchestra.server.event", { event }, { source: "sdk" });
            }
          } catch {
            // ignore stream errors
          }
        })();
      } catch {
        // event subscription failed (non-fatal)
        abortController = undefined;
      }
    },
    stop: async () => {
      abortController?.abort();
      abortController = undefined;
      if (streamTask) {
        try {
          await streamTask;
        } catch {
          // ignore stream errors
        }
        streamTask = undefined;
      }
      emitter.removeAllListeners();
    },
    health: async () => ({ ok: true }),
  };
};
