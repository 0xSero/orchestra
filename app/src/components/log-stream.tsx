/**
 * LogStream Component - Placeholder for future log streaming
 */

import { type Component } from "solid-js";

const TerminalIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <polyline points="4 17 10 11 4 5" />
    <line x1="12" x2="20" y1="19" y2="19" />
  </svg>
);

export const LogStream: Component = () => {
  return (
    <div class="flex flex-col h-full bg-background">
      {/* Header */}
      <div class="flex items-center justify-between px-4 py-2 border-b border-border flex-shrink-0">
        <h2 class="text-sm font-medium text-foreground">Logs</h2>
      </div>

      {/* Empty state */}
      <div class="flex-1 flex flex-col items-center justify-center p-4 text-center">
        <div class="text-muted-foreground/50">
          <TerminalIcon />
        </div>
        <p class="text-sm text-muted-foreground mt-3">
          No logs to display
        </p>
        <p class="text-xs text-muted-foreground/70 mt-1">
          Log streaming coming soon
        </p>
      </div>
    </div>
  );
};
