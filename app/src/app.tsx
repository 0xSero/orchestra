/**
 * App Component - Root application with providers
 *
 * Connects to OpenCode server (localhost:4096) for session/agent data.
 * Uses the OpenCode SDK for session/agent data.
 */

import { type Component, ErrorBoundary } from "solid-js";
import { Router, Route } from "@solidjs/router";
import { OpenCodeProvider } from "@/context/opencode";
import { LayoutProvider } from "@/context/layout";
import { SkillsProvider } from "@/context/skills";
import { Dashboard } from "@/pages/dashboard";

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

export const App: Component = () => {
  // Log to help debug blank screen issues
  console.log("[App] Rendering App component");

  return (
    <ErrorBoundary fallback={(err) => <ErrorFallback error={err} />}>
      <OpenCodeProvider>
        <SkillsProvider>
          <LayoutProvider>
            <Router root={(props) => {
              console.log("[Router] Rendering with children:", !!props.children);
              return <>{props.children}</>;
            }}>
              <Route path="/" component={Dashboard} />
              <Route path="*" component={Dashboard} />
            </Router>
          </LayoutProvider>
        </SkillsProvider>
      </OpenCodeProvider>
    </ErrorBoundary>
  );
};
