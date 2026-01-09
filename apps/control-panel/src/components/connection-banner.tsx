/**
 * Connection Banner - Shows server status and offers to start it
 */

import { type Component, createSignal, Show } from "solid-js";
import { Button } from "@/components/ui/button";
import { useOpenCode } from "@/context/opencode";
import { getExpectedPorts } from "@/lib/server-health";

const AlertIcon: Component = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
  >
    <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
    <path d="M12 9v4" />
    <path d="M12 17h.01" />
  </svg>
);

const RefreshIcon: Component = () => (
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
    class="animate-spin"
  >
    <path d="M21 12a9 9 0 1 1-6.219-8.56" />
  </svg>
);

export const ConnectionBanner: Component = () => {
  const { connected, refresh, workers } = useOpenCode();
  const [dismissed, setDismissed] = createSignal(false);
  const [retrying, setRetrying] = createSignal(false);

  const ports = getExpectedPorts();

  const handleRetry = async () => {
    setRetrying(true);
    try {
      await refresh();
    } finally {
      setTimeout(() => setRetrying(false), 1000);
    }
  };

  // Don't show if connected, has workers (orchestrator is working), or dismissed
  const hasOrchestratorData = () => workers().length > 0;
  if (connected() || hasOrchestratorData() || dismissed()) return null;

  return (
    <Show when={!connected() && !hasOrchestratorData() && !dismissed()}>
      <div class="bg-status-error/10 border-b border-status-error/20 px-4 py-2.5 flex items-center gap-3">
        <div class="flex items-center gap-2 text-status-error">
          <AlertIcon />
          <span class="text-sm font-medium">Orchestrator Disconnected</span>
        </div>

        <span class="text-xs text-muted-foreground">
          Unable to connect to orchestrator on port {ports.orchestratorPort}
        </span>

        <div class="flex-1" />

        <div class="flex items-center gap-2">
          <span class="text-xs text-muted-foreground mr-2">
            Check orchestrator is running via Docker or CLI
          </span>

          <Button
            variant="outline"
            size="sm"
            onClick={handleRetry}
            disabled={retrying()}
            class="h-7 text-xs"
          >
            <Show when={retrying()} fallback="Retry">
              <RefreshIcon />
              <span class="ml-1.5">Checking...</span>
            </Show>
          </Button>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => setDismissed(true)}
            class="h-7 text-xs text-muted-foreground"
          >
            Dismiss
          </Button>
        </div>
      </div>
    </Show>
  );
};

/**
 * Small connection indicator for the sidebar
 */
export const ConnectionIndicator: Component = () => {
  const { connected } = useOpenCode();

  return (
    <div
      class="flex items-center gap-1.5 text-xs"
      title={connected() ? "Connected to server" : "Server disconnected"}
    >
      <span
        class={`w-2 h-2 rounded-full ${
          connected() ? "bg-status-ready" : "bg-status-error"
        }`}
      />
      <span class="text-muted-foreground">
        {connected() ? "Online" : "Offline"}
      </span>
    </div>
  );
};
