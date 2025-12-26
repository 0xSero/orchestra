/**
 * App Component - Root application with providers
 *
 * Connects to OpenCode server (localhost:4096) for session/agent data.
 * Uses the OpenCode SDK for session/agent data.
 */

import { type Component, type JSX, ErrorBoundary } from "solid-js";
import { Router, Route, Navigate } from "@solidjs/router";
import { OpenCodeProvider } from "@/context/opencode";
import { LayoutProvider } from "@/context/layout";
import { SkillsProvider } from "@/context/skills";
import { AppLayout } from "@/components/layout/app-layout";
import { ChatPage, AgentsPage, ProfilesPage, LogsPage } from "@/pages";

const ErrorFallback: Component<{ error: Error }> = (props) => {
  console.error("[App] Render error:", props.error);
  return (
    <div class="h-screen flex items-center justify-center bg-background text-foreground p-4">
      <div class="max-w-md text-center">
        <h1 class="text-xl font-semibold mb-2">Something went wrong</h1>
        <pre class="text-xs text-red-500 bg-muted p-2 rounded overflow-auto max-h-40">
          {props.error.message}
        </pre>
      </div>
    </div>
  );
};

// Layout wrapper that provides shared navigation
const LayoutWrapper: Component<{ children?: JSX.Element }> = (props) => {
  return <AppLayout>{props.children}</AppLayout>;
};

export const App: Component = () => {
  console.log("[App] Rendering App component");

  return (
    <ErrorBoundary fallback={(err) => <ErrorFallback error={err} />}>
      <OpenCodeProvider>
        <SkillsProvider>
          <LayoutProvider>
            <Router root={LayoutWrapper}>
              {/* Redirect root to chat */}
              <Route path="/" component={() => <Navigate href="/chat" />} />

              {/* Main pages */}
              <Route path="/chat" component={ChatPage} />
              <Route path="/agents" component={AgentsPage} />
              <Route path="/profiles" component={ProfilesPage} />
              <Route path="/logs" component={LogsPage} />

              {/* Fallback - redirect unknown routes to chat */}
              <Route path="*" component={() => <Navigate href="/chat" />} />
            </Router>
          </LayoutProvider>
        </SkillsProvider>
      </OpenCodeProvider>
    </ErrorBoundary>
  );
};
