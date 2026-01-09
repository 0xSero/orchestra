import { EventEmitter } from "node:events";

export interface EventCleanupConfig {
  intervalMs: number;
  maxListeners: number;
}

interface TrackedListener {
  listener: WeakRef<(event: any) => void>;
  eventType: string;
  addedAt: number;
}

export class EventCleanup {
  private emitter: EventEmitter;
  private trackedListeners: Map<number, TrackedListener>;
  private listenerCounter = 0;
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private isRunning = false;
  private readonly config: EventCleanupConfig;

  constructor(config?: Partial<EventCleanupConfig>) {
    this.emitter = new EventEmitter();
    this.trackedListeners = new Map();
    this.config = {
      intervalMs: config?.intervalMs ?? 300000,
      maxListeners: config?.maxListeners ?? 100,
    };
    this.emitter.setMaxListeners(this.config.maxListeners);
  }

  private addTrackedListener(
    listener: (event: any) => void,
    eventType: string,
  ): number {
    const id = ++this.listenerCounter;
    const weakRef = new WeakRef(listener);
    this.trackedListeners.set(id, {
      listener: weakRef,
      eventType,
      addedAt: Date.now(),
    });
    return id;
  }

  private removeTrackedListener(id: number): void {
    this.trackedListeners.delete(id);
  }

  cleanupOrphanedListeners(): void {
    const now = Date.now();
    const staleThresholdMs = this.config.intervalMs * 2;

    for (const [id, tracked] of this.trackedListeners) {
      const ref = tracked.listener.deref();
      if (ref === undefined) {
        this.trackedListeners.delete(id);
        continue;
      }

      if (now - tracked.addedAt >= staleThresholdMs) {
        try {
          this.emitter.off(tracked.eventType, ref);
        } catch {
        } finally {
          this.trackedListeners.delete(id);
        }
      }
    }
  }

  startPeriodicCleanup(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    this.intervalId = setInterval(() => {
      this.cleanupOrphanedListeners();
    }, this.config.intervalMs);
  }

  stopPeriodicCleanup(): void {
    if (!this.isRunning) return;
    this.isRunning = false;
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  on(eventType: string, listener: (event: any) => void): () => void {
    const listenerId = this.addTrackedListener(listener, eventType);
    this.emitter.on(eventType, listener);
    return () => {
      this.emitter.off(eventType, listener);
      this.removeTrackedListener(listenerId);
    };
  }

  emit(eventType: string, event: any): boolean {
    return this.emitter.emit(eventType, event);
  }

  off(eventType?: string, listener?: (event: any) => void): void {
    if (!eventType) {
      this.emitter.removeAllListeners();
      return;
    }
    if (listener) {
      this.emitter.off(eventType, listener);
    } else {
      this.emitter.removeAllListeners(eventType);
    }
  }

  getListenerCount(eventType?: string): number {
    if (eventType) {
      return this.emitter.listenerCount(eventType);
    }
    return this.emitter.listenerCount("event");
  }

  getTrackedListenerCount(): number {
    return this.trackedListeners.size;
  }

  getConfig(): EventCleanupConfig {
    return { ...this.config };
  }

  getIsRunning(): boolean {
    return this.isRunning;
  }

  destroy(): void {
    this.stopPeriodicCleanup();
    this.emitter.removeAllListeners();
    this.trackedListeners.clear();
  }
}

export function getDefaultEventCleanupConfig(): EventCleanupConfig {
  return {
    intervalMs: 300000,
    maxListeners: 100,
  };
}
