import type { CommunicationService } from "../communication";
import type { WorkerForwardEvent, WorkerInstance } from "../types/worker";
import type { WorkerSessionManager } from "./session-manager";

/**
 * Event forwarding handle that can be stopped.
 */
export interface EventForwardingHandle {
  stop: () => void;
  isActive: () => boolean;
}

/**
 * Configuration for event forwarding.
 */
export interface EventForwardingConfig {
  /** Events to forward */
  events: WorkerForwardEvent[];
  /** Polling interval in ms (for SDK clients without streaming) */
  pollIntervalMs?: number;
  /** Maximum events to process per poll */
  maxEventsPerPoll?: number;
}

const DEFAULT_POLL_INTERVAL_MS = 1000;
const DEFAULT_MAX_EVENTS_PER_POLL = 20;

/**
 * Start forwarding events from a worker session to the session manager.
 * This enables visibility into linked worker sessions.
 */
export function startEventForwarding(
  instance: WorkerInstance,
  sessionManager: WorkerSessionManager,
  _communication: CommunicationService,
  config?: Partial<EventForwardingConfig>,
): EventForwardingHandle {
  const events = config?.events ?? ["tool", "message", "error", "complete", "progress"];
  const pollIntervalMs = config?.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  const maxEventsPerPoll = config?.maxEventsPerPoll ?? DEFAULT_MAX_EVENTS_PER_POLL;

  let active = true;
  let lastMessageId: string | undefined;
  let pollTimer: ReturnType<typeof setTimeout> | undefined;

  const poll = async () => {
    if (!active || !instance.client || !instance.sessionId) return;

    try {
      // Fetch messages from the worker session
      const result = await instance.client.session.messages({
        path: { id: instance.sessionId },
        query: { directory: instance.directory ?? process.cwd() },
      });

      const messages = (result as any)?.data ?? [];
      if (!Array.isArray(messages)) return;

      // Process new messages
      let foundLast = !lastMessageId;
      let processed = 0;

      for (const msg of messages) {
        const msgId = msg?.info?.id;
        if (!msgId) continue;

        // Skip until we find our last seen message
        if (!foundLast) {
          if (msgId === lastMessageId) foundLast = true;
          continue;
        }

        // Skip if this is the last message itself
        if (msgId === lastMessageId) continue;

        // Process this message
        await processMessage(msg, instance, sessionManager, _communication, events);
        lastMessageId = msgId;
        processed++;

        if (processed >= maxEventsPerPoll) break;
      }

      // Update instance activity
      if (processed > 0) {
        instance.lastActivity = new Date();
        instance.messageCount = (instance.messageCount ?? 0) + processed;
      }
    } catch (error) {
      // Log but don't stop polling on transient errors
      const errMsg = error instanceof Error ? error.message : String(error);
      if (!errMsg.includes("not found") && !errMsg.includes("closed")) {
        // Record error in session manager (which will emit event via communication)
        if (instance.sessionId) {
          sessionManager.updateStatus(instance.sessionId, "error", errMsg);
        }
      }
    }

    // Schedule next poll if still active
    if (active) {
      pollTimer = setTimeout(poll, pollIntervalMs);
    }
  };

  // Start polling
  pollTimer = setTimeout(poll, pollIntervalMs);

  return {
    stop: () => {
      active = false;
      if (pollTimer) {
        clearTimeout(pollTimer);
        pollTimer = undefined;
      }
    },
    isActive: () => active,
  };
}

/**
 * Process a message from a worker session and emit appropriate events.
 */
async function processMessage(
  msg: any,
  instance: WorkerInstance,
  sessionManager: WorkerSessionManager,
  _communication: CommunicationService,
  events: WorkerForwardEvent[],
): Promise<void> {
  const info = msg?.info;
  const parts = msg?.parts ?? [];
  const role = info?.role;
  const msgId = info?.id;

  if (!msgId) return;

  // Determine event type based on message content
  for (const part of parts) {
    const partType = part?.type;

    // Tool events
    if (partType === "tool-invocation" && events.includes("tool")) {
      const toolName = part?.toolInvocation?.toolName ?? "unknown";
      sessionManager.recordActivity(instance.sessionId!, {
        type: "tool",
        summary: `Tool: ${toolName}`,
        details: {
          toolName,
          args: part?.toolInvocation?.args,
          status: part?.toolInvocation?.state,
        },
      });
      instance.toolCount = (instance.toolCount ?? 0) + 1;
    }

    // Text message events
    if (partType === "text" && events.includes("message")) {
      const text = part?.text ?? "";
      const preview = text.slice(0, 100) + (text.length > 100 ? "..." : "");
      sessionManager.recordActivity(instance.sessionId!, {
        type: "message",
        summary: `${role === "user" ? "User" : "Assistant"}: ${preview}`,
        details: { role, text },
      });
    }

    // Error events
    if (partType === "error" && events.includes("error")) {
      const error = part?.error ?? "Unknown error";
      sessionManager.recordActivity(instance.sessionId!, {
        type: "error",
        summary: `Error: ${error}`,
        details: { error },
      });
      sessionManager.updateStatus(instance.sessionId!, "error", String(error));
    }

    // Progress/thinking events
    if (partType === "reasoning" && events.includes("progress")) {
      sessionManager.recordActivity(instance.sessionId!, {
        type: "progress",
        summary: "Thinking...",
        details: { content: part?.reasoning?.content },
      });
    }
  }

  // Check for completion
  if (role === "assistant" && events.includes("complete")) {
    const hasToolPending = parts.some(
      (p: any) => p?.type === "tool-invocation" && p?.toolInvocation?.state === "pending",
    );
    if (!hasToolPending) {
      sessionManager.recordActivity(instance.sessionId!, {
        type: "complete",
        summary: "Response complete",
        details: { messageId: msgId },
      });
    }
  }
}

/**
 * Stop event forwarding for a worker instance.
 */
export function stopEventForwarding(instance: WorkerInstance): void {
  if (instance.eventForwardingHandle) {
    instance.eventForwardingHandle.stop();
    instance.eventForwardingHandle = undefined;
  }
}
