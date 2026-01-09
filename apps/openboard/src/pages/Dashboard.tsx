/**
 * OpenBoard Dashboard
 *
 * Placeholder scaffold - the actual OpenBoard implementation
 * should be transplanted here when available.
 */

import type { Component } from "solid-js";

export const Dashboard: Component = () => {
  return (
    <div class="h-full flex flex-col">
      {/* Header */}
      <header class="flex items-center justify-between px-6 py-4 border-b border-border bg-card">
        <div class="flex items-center gap-4">
          <h1 class="text-xl font-semibold">OpenBoard</h1>
          <span class="text-xs text-muted-foreground px-2 py-1 rounded bg-muted">
            Scaffold
          </span>
        </div>
      </header>

      {/* Main content */}
      <main class="flex-1 p-6">
        <div class="max-w-2xl mx-auto">
          <div class="card">
            <div class="card-header">
              <h2 class="text-lg font-semibold">OpenBoard Scaffold</h2>
            </div>
            <div class="card-content space-y-4">
              <p class="text-sm text-muted-foreground">
                This is a placeholder for the OpenBoard application. The actual OpenBoard
                source should be transplanted here when available.
              </p>
              <div class="p-4 rounded-lg bg-muted/50 border border-border">
                <h3 class="text-sm font-medium mb-2">Next Steps</h3>
                <ul class="text-sm text-muted-foreground space-y-1 list-disc list-inside">
                  <li>Import actual OpenBoard source code</li>
                  <li>Configure API connections</li>
                  <li>Wire up orchestrator bridge client</li>
                  <li>Add comprehensive tests</li>
                </ul>
              </div>
              <div class="flex gap-2">
                <button type="button" class="btn btn-primary">
                  Get Started
                </button>
                <button type="button" class="btn">
                  Learn More
                </button>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};
