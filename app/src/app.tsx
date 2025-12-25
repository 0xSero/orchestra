/**
 * App Component - Root application with providers
 *
 * Connects to OpenCode server (localhost:4096) for session/agent data.
 * Uses the OpenCode SDK for session/agent data.
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
