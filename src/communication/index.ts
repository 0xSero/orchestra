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

  const emit = <T extends OrchestraEventName>(type: T, data: OrchestraEventMap[T], meta: OrchestraEventMeta) => {
    emitter.emit(type, { type, data, meta } satisfies OrchestraEvent<T>);
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
      if (!enableSdkEvents) return;
      if (abortController) return;
      abortController = new AbortController();

      try {
        const result = await deps.api.event.subscribe({ signal: abortController.signal } as any);
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
