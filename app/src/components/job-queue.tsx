/**
 * JobQueue Component - Placeholder for future job tracking
 * OpenCode doesn't have a jobs concept like the orchestrator did.
 */

import { type Component } from "solid-js";

const ClockIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="12" cy="12" r="10" />
    <polyline points="12 6 12 12 16 14" />
  </svg>
);

export const JobQueue: Component = () => {
  return (
    <div class="flex flex-col h-full bg-background">
      {/* Header */}
      <div class="flex items-center justify-between px-4 py-3 border-b border-border flex-shrink-0">
        <h2 class="text-sm font-medium text-foreground">Jobs</h2>
        <span class="text-xs text-muted-foreground">0 total</span>
      </div>

      {/* Empty state */}
      <div class="flex-1 flex flex-col items-center justify-center p-4 text-center">
        <div class="text-muted-foreground/50">
          <ClockIcon />
        </div>
        <p class="text-sm text-muted-foreground mt-3">
          No jobs to display
        </p>
        <p class="text-xs text-muted-foreground/70 mt-1 max-w-[200px]">
          Job tracking coming soon
        </p>
      </div>
    </div>
  );
};
