/**
 * App Component - Root application with providers
 *
 * Connects to OpenCode server (localhost:4096) for session/agent data.
 * Falls back to Supervisor SDK for orchestrator-specific features.
 */

import { type Component } from "solid-js";
import { Router, Route } from "@solidjs/router";
import { OpenCodeProvider } from "@/context/opencode";
import { LayoutProvider } from "@/context/layout";
import { Dashboard } from "@/pages/dashboard";

export const App: Component = () => {
  return (
    <OpenCodeProvider>
      <LayoutProvider>
        <Router>
          <Route path="/" component={Dashboard} />
          <Route path="*" component={Dashboard} />
        </Router>
      </LayoutProvider>
    </OpenCodeProvider>
  );
};
