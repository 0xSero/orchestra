import { randomUUID } from "node:crypto";
import type { WakeupPayload } from "../types";

export type BusMessage = {
  id: string;
  from: string;
  to: string;
  topic?: string;
  jobId?: string;
  text: string;
  createdAt: number;
};

export type WakeupEvent = WakeupPayload & {
  id: string;
};

export type WakeupListener = (event: WakeupEvent) => void | Promise<void>;
export type MessageListener = (msg: BusMessage) => void | Promise<void>;

const MAX_MESSAGES_PER_INBOX = 200;
const MAX_WAKEUP_HISTORY = 100;
const WAKEUP_DEDUPE_WINDOW_MS = 1500;

export class MessageBus {
  private inboxes = new Map<string, BusMessage[]>();
  private wakeupHistory: WakeupEvent[] = [];
  private wakeupListeners: Set<WakeupListener> = new Set();
  private messageListeners: Set<MessageListener> = new Set();
  private recentWakeups = new Map<string, WakeupEvent>();
  private recentWakeupAt = new Map<string, number>();

  send(input: Omit<BusMessage, "id" | "createdAt">): BusMessage {
    const msg: BusMessage = { id: randomUUID(), createdAt: Date.now(), ...input };
    const arr = this.inboxes.get(msg.to) ?? [];
    arr.push(msg);
    if (arr.length > MAX_MESSAGES_PER_INBOX) {
      arr.splice(0, arr.length - MAX_MESSAGES_PER_INBOX);
    }
    this.inboxes.set(msg.to, arr);

    for (const listener of this.messageListeners) {
      try {
        const result = listener(msg);
        if (result instanceof Promise) {
          result.catch(() => {});
        }
      } catch {
        // Ignore listener errors
      }
    }

    return msg;
  }

  list(to: string, options?: { limit?: number; after?: number }): BusMessage[] {
    const limit = Math.max(1, options?.limit ?? 50);
    const after = options?.after ?? 0;
    const arr = this.inboxes.get(to) ?? [];
    return arr.filter((m) => m.createdAt > after).slice(-limit);
  }

  clear(to: string, upToCreatedAt?: number): number {
    const arr = this.inboxes.get(to) ?? [];
    if (!upToCreatedAt) {
      this.inboxes.delete(to);
      return arr.length;
    }
    const next = arr.filter((m) => m.createdAt > upToCreatedAt);
    this.inboxes.set(to, next);
    return arr.length - next.length;
  }

  /**
   * Register a listener for new messages.
   * Returns a function to unregister the listener.
   */
  onMessage(listener: MessageListener): () => void {
    this.messageListeners.add(listener);
    return () => this.messageListeners.delete(listener);
  }

  /**
   * Emit a wakeup event from a worker to the orchestrator.
   * This notifies all registered listeners that a worker needs attention.
   */
  wakeup(payload: WakeupPayload): WakeupEvent {
    const key = this.getWakeupDedupeKey(payload);
    if (key) {
      const lastAt = this.recentWakeupAt.get(key);
      const last = this.recentWakeups.get(key);
      if (lastAt && last && Date.now() - lastAt < WAKEUP_DEDUPE_WINDOW_MS) {
        return last;
      }
    }

    const event: WakeupEvent = {
      id: randomUUID(),
      ...payload,
    };

    if (key) {
      this.recentWakeups.set(key, event);
      this.recentWakeupAt.set(key, Date.now());
      // Opportunistic pruning to avoid unbounded growth.
      for (const [k, ts] of this.recentWakeupAt.entries()) {
        if (Date.now() - ts > WAKEUP_DEDUPE_WINDOW_MS) {
          this.recentWakeupAt.delete(k);
          this.recentWakeups.delete(k);
        }
      }
    }

    // Store in history
    this.wakeupHistory.push(event);
    if (this.wakeupHistory.length > MAX_WAKEUP_HISTORY) {
      this.wakeupHistory.splice(0, this.wakeupHistory.length - MAX_WAKEUP_HISTORY);
    }

    // Notify all listeners
    for (const listener of this.wakeupListeners) {
      try {
        const result = listener(event);
        if (result instanceof Promise) {
          result.catch(() => {}); // Fire and forget async listeners
        }
      } catch {
        // Ignore listener errors
      }
    }

    return event;
  }

  /**
   * Register a listener for wakeup events.
   * Returns a function to unregister the listener.
   */
  onWakeup(listener: WakeupListener): () => void {
    this.wakeupListeners.add(listener);
    return () => this.wakeupListeners.delete(listener);
  }

  hasWakeup(options: { workerId?: string; jobId?: string; reason?: WakeupPayload["reason"]; after?: number }): boolean {
    const after = options.after ?? 0;
    return this.wakeupHistory.some((e) => {
      if (after && e.timestamp <= after) return false;
      if (options.workerId && e.workerId !== options.workerId) return false;
      if (options.jobId && e.jobId !== options.jobId) return false;
      if (options.reason && e.reason !== options.reason) return false;
      return true;
    });
  }

  /**
   * Get recent wakeup events, optionally filtered by worker ID.
   */
  getWakeupHistory(options?: { workerId?: string; limit?: number; after?: number }): WakeupEvent[] {
    let events = this.wakeupHistory;
    
    if (options?.workerId) {
      events = events.filter((e) => e.workerId === options.workerId);
    }
    
    if (options?.after) {
      events = events.filter((e) => e.timestamp > options.after!);
    }
    
    const limit = options?.limit ?? 50;
    return events.slice(-limit);
  }

  /**
   * Clear wakeup history, optionally for a specific worker.
   */
  clearWakeupHistory(workerId?: string): number {
    if (!workerId) {
      const count = this.wakeupHistory.length;
      this.wakeupHistory = [];
      return count;
    }
    
    const before = this.wakeupHistory.length;
    this.wakeupHistory = this.wakeupHistory.filter((e) => e.workerId !== workerId);
    return before - this.wakeupHistory.length;
  }

  private getWakeupDedupeKey(payload: WakeupPayload): string | undefined {
    if (!payload.jobId) return undefined;
    // Allow many progress updates; only dedupe terminal events.
    if (payload.reason !== "result_ready" && payload.reason !== "error") return undefined;
    return `${payload.workerId}:${payload.jobId}:${payload.reason}`;
  }
}

export const messageBus = new MessageBus();
