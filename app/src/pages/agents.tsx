/**
 * Agents Page - View and manage agents/workers with real data
 */

import { A } from "@solidjs/router";
import { type Component, createMemo, createSignal, For, Show } from "solid-js";
import { useLayout } from "@/context/layout";
import { useOpenCode } from "@/context/opencode";

// Icons
const BotIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
  >
    <path d="M12 8V4H8" />
    <rect width="16" height="12" x="4" y="8" rx="2" />
    <path d="M2 14h2" />
    <path d="M20 14h2" />
    <path d="M15 13v2" />
    <path d="M9 13v2" />
  </svg>
);

const ServerIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
  >
    <rect width="20" height="8" x="2" y="2" rx="2" ry="2" />
    <rect width="20" height="8" x="2" y="14" rx="2" ry="2" />
    <line x1="6" x2="6.01" y1="6" y2="6" />
    <line x1="6" x2="6.01" y1="18" y2="18" />
  </svg>
);

const StopIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
  >
    <rect width="14" height="14" x="5" y="5" rx="2" />
  </svg>
);

const ChatIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
  >
    <path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z" />
  </svg>
);

const ExternalLinkIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="12"
    height="12"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
  >
    <path d="M15 3h6v6" />
    <path d="M10 14 21 3" />
    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
  </svg>
);

// Format duration
const formatDuration = (startTime?: string | number): string => {
  if (!startTime) return "N/A";
  const start = typeof startTime === "string" ? new Date(startTime).getTime() : startTime;
  const now = Date.now();
  const diff = now - start;

  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m`;
  return `${seconds}s`;
};

const getStatusLabel = (status: string): string => {
  switch (status) {
    case "ready":
      return "Idle";
    case "busy":
      return "Running";
    case "error":
      return "Error";
    case "starting":
      return "Starting";
    case "stopped":
      return "Stopped";
    default:
      return status;
  }
};

export const AgentsPage: Component = () => {
  const { agents, sessions, workers, abortSession } = useOpenCode();
  const { selectWorker } = useLayout();
  const [selectedWorker, setSelectedWorker] = createSignal<string | null>(null);

  // Get selected worker details
  const workerDetails = createMemo(() => {
    const id = selectedWorker();
    if (!id) return null;
    return workers().find((w) => w.id === id) || null;
  });

  // Stats
  const stats = createMemo(() => {
    const w = workers();
    return {
      total: w.length,
      active: w.filter((x) => x.status === "busy" || x.status === "starting").length,
      ready: w.filter((x) => x.status === "ready").length,
      error: w.filter((x) => x.status === "error").length,
    };
  });

  const handleAbortWorker = async (sessionId?: string) => {
    if (sessionId) await abortSession(sessionId);
  };

  const handleOpenChat = (sessionId: string) => {
    selectWorker(sessionId);
    window.location.href = "/chat";
  };

  return (
    <div class="flex-1 flex overflow-hidden">
      {/* Workers sidebar */}
      <aside class="w-80 border-r border-border overflow-hidden flex flex-col bg-card/30">
        <div class="p-4 border-b border-border">
          <h2 class="text-sm font-semibold text-foreground mb-3">Workers</h2>

          {/* Stats */}
          <div class="grid grid-cols-4 gap-2 text-xs">
            <div class="text-center p-2 rounded-md bg-muted/50">
              <div class="font-semibold text-foreground">{stats().total}</div>
              <div class="text-muted-foreground">Total</div>
            </div>
            <div class="text-center p-2 rounded-md bg-status-busy/10">
              <div class="font-semibold text-status-busy">{stats().active}</div>
              <div class="text-muted-foreground">Active</div>
            </div>
            <div class="text-center p-2 rounded-md bg-status-ready/10">
              <div class="font-semibold text-status-ready">{stats().ready}</div>
              <div class="text-muted-foreground">Ready</div>
            </div>
            <div class="text-center p-2 rounded-md bg-status-error/10">
              <div class="font-semibold text-status-error">{stats().error}</div>
              <div class="text-muted-foreground">Error</div>
            </div>
          </div>
        </div>

        <div class="flex-1 overflow-auto scrollbar-thin">
          <For each={workers()}>
            {(worker) => (
              <button
                class={`session-item w-full text-left ${selectedWorker() === worker.id ? "selected" : ""}`}
                onClick={() => setSelectedWorker(worker.id)}
              >
                <div class="session-item-header">
                  <div class="flex items-center gap-2 min-w-0 flex-1">
                    <span class={`status-dot ${worker.status}`} />
                    <span class="session-item-title">{worker.name || worker.id.slice(0, 12)}</span>
                  </div>
                  <span class={`status-badge ${worker.status}`}>{getStatusLabel(worker.status)}</span>
                </div>

                <div class="session-item-meta mt-1">
                  <Show when={worker.port}>
                    <span class="flex items-center gap-1 font-mono">
                      <ServerIcon />:{worker.port}
                    </span>
                  </Show>
                  <Show when={worker.model}>
                    <span class="truncate">{worker.model}</span>
                  </Show>
                </div>
              </button>
            )}
          </For>

          <Show when={workers().length === 0}>
            <div class="empty-state py-12">
              <div class="empty-state-icon">
                <BotIcon />
              </div>
              <p class="empty-state-title">No workers</p>
              <p class="empty-state-description">Workers will appear here when sessions are active.</p>
            </div>
          </Show>
        </div>
      </aside>

      {/* Worker details panel */}
      <div class="flex-1 overflow-auto p-6">
        <Show when={workerDetails()}>
          {(worker) => {
            const session = createMemo(() =>
              worker().sessionId ? sessions().find((s) => s.id === worker().sessionId) : undefined,
            );

            return (
              <div class="max-w-4xl animate-fade-in">
                {/* Worker header */}
                <div class="flex items-start justify-between mb-6">
                  <div>
                    <div class="flex items-center gap-3 mb-2">
                      <div class="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                        <BotIcon />
                      </div>
                      <div>
                        <h1 class="text-xl font-semibold text-foreground">
                          {worker().name || worker().id.slice(0, 16)}
                        </h1>
                        <p class="text-sm text-muted-foreground font-mono">{worker().id}</p>
                      </div>
                    </div>
                  </div>

                  <div class="flex items-center gap-2">
                    <Show when={worker().sessionId}>
                      <button
                        class="btn btn-sm btn-ghost"
                        onClick={() => handleOpenChat(worker().sessionId!)}
                        title="Open chat"
                      >
                        <ChatIcon />
                        Chat
                      </button>
                    </Show>
                    <Show when={worker().status === "busy" && worker().sessionId}>
                      <button
                        class="btn btn-sm btn-destructive"
                        onClick={() => handleAbortWorker(worker().sessionId)}
                        title="Stop worker"
                      >
                        <StopIcon />
                        Stop
                      </button>
                    </Show>
                  </div>
                </div>

                {/* Status and metadata */}
                <div class="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                  <div class="card p-4">
                    <div class="text-xs text-muted-foreground mb-1">Status</div>
                    <div class="flex items-center gap-2">
                      <span class={`status-dot ${worker().status}`} />
                      <span class="font-medium">{getStatusLabel(worker().status)}</span>
                    </div>
                  </div>

                  <div class="card p-4">
                    <div class="text-xs text-muted-foreground mb-1">Port</div>
                    <div class="font-mono font-medium">{worker().port || "N/A"}</div>
                  </div>

                  <div class="card p-4">
                    <div class="text-xs text-muted-foreground mb-1">Model</div>
                    <div class="font-medium truncate">{worker().model || "default"}</div>
                  </div>

                  <div class="card p-4">
                    <div class="text-xs text-muted-foreground mb-1">Last Activity</div>
                    <div class="font-medium">
                      {worker().lastActivity ? formatDuration(worker().lastActivity) : "N/A"}
                    </div>
                  </div>
                </div>

                {/* Server URL */}
                <Show when={worker().serverUrl}>
                  <div class="card p-4 mb-6">
                    <div class="text-xs text-muted-foreground mb-2">Server URL</div>
                    <div class="flex items-center gap-2">
                      <code class="text-sm font-mono text-foreground flex-1 truncate">{worker().serverUrl}</code>
                      <a
                        href={worker().serverUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        class="btn btn-sm btn-ghost"
                      >
                        <ExternalLinkIcon />
                      </a>
                    </div>
                  </div>
                </Show>

                {/* Capabilities */}
                <Show when={worker().supportsVision || worker().supportsWeb}>
                  <div class="card p-4 mb-6">
                    <div class="text-xs text-muted-foreground mb-2">Capabilities</div>
                    <div class="flex items-center gap-2">
                      <Show when={worker().supportsVision}>
                        <span class="badge">Vision</span>
                      </Show>
                      <Show when={worker().supportsWeb}>
                        <span class="badge">Web</span>
                      </Show>
                    </div>
                  </div>
                </Show>

                {/* Error/Warning */}
                <Show when={worker().error}>
                  <div class="card p-4 mb-6 border-status-error/50 bg-status-error/5">
                    <div class="text-xs text-status-error mb-2">Error</div>
                    <div class="text-sm text-foreground">{worker().error}</div>
                  </div>
                </Show>

                <Show when={worker().warning}>
                  <div class="card p-4 mb-6 border-status-busy/50 bg-status-busy/5">
                    <div class="text-xs text-status-busy mb-2">Warning</div>
                    <div class="text-sm text-foreground">{worker().warning}</div>
                  </div>
                </Show>

                {/* Linked session */}
                <Show when={session()}>
                  {(s) => (
                    <div class="card p-4">
                      <div class="text-xs text-muted-foreground mb-3">Linked Session</div>
                      <div class="flex items-center justify-between">
                        <div>
                          <div class="font-medium text-foreground">{s().title || "Untitled Session"}</div>
                          <div class="text-xs text-muted-foreground font-mono mt-1">{s().id}</div>
                        </div>
                        <A href="/chat" class="btn btn-sm" onClick={() => selectWorker(s().id)}>
                          Open Chat
                        </A>
                      </div>
                    </div>
                  )}
                </Show>
              </div>
            );
          }}
        </Show>

        <Show when={!selectedWorker()}>
          <div class="empty-state h-full">
            <div class="empty-state-icon">
              <BotIcon />
            </div>
            <p class="empty-state-title">Select a worker</p>
            <p class="empty-state-description">Choose a worker from the sidebar to view details.</p>
          </div>
        </Show>
      </div>

      {/* Agents list panel */}
      <aside class="w-72 border-l border-border overflow-hidden flex flex-col">
        <div class="p-4 border-b border-border">
          <h2 class="text-sm font-semibold text-foreground">Registered Agents</h2>
          <p class="text-xs text-muted-foreground mt-1">{agents().length} agents</p>
        </div>

        <div class="flex-1 overflow-auto scrollbar-thin">
          <For each={agents()}>
            {(agent) => {
              return (
                <div class="p-3 border-b border-border hover:bg-accent/50 transition-colors">
                  <div class="flex items-center gap-2 mb-1">
                    <div class="w-6 h-6 rounded bg-primary/10 flex items-center justify-center">
                      <BotIcon />
                    </div>
                    <span class="text-sm font-medium text-foreground truncate">{agent.name}</span>
                  </div>
                  <div class="text-xs text-muted-foreground ml-8">
                    {agent.mode === "primary" ? "Primary" : agent.mode === "subagent" ? "Subagent" : "Shared"}
                  </div>
                </div>
              );
            }}
          </For>

          <Show when={agents().length === 0}>
            <div class="p-4 text-center text-muted-foreground text-sm">No agents registered</div>
          </Show>
        </div>
      </aside>
    </div>
  );
};
