/**
 * OpenBoard App Component
 *
 * Placeholder scaffold - the actual OpenBoard implementation
 * should be transplanted here when available.
 */

import type { Component } from "solid-js";
import { Dashboard } from "./pages/Dashboard";

export const App: Component = () => {
  return (
    <div class="min-h-screen bg-background text-foreground">
      <Dashboard />
    </div>
  );
};
