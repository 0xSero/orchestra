/**
 * App Component - Root application with providers
 *
 * Connects to OpenCode server (localhost:4096) for session/agent data.
 * Uses the OpenCode SDK for session/agent data.
 */

import { Navigate, Route, Router, useLocation, useNavigate } from "@solidjs/router";
import { type Component, createEffect, ErrorBoundary, type JSX } from "solid-js";
import { AppLayout } from "@/components/layout/app-layout";
import { DbProvider, useDb } from "@/context/db";
import { LayoutProvider } from "@/context/layout";
import { OpenCodeProvider } from "@/context/opencode";
import { AgentsProvider } from "@/context/agents";
import { resolveAgentsBase, resolveOpenCodeBase } from "@/lib/opencode-base";
import {
  AgentsPage,
  ChatPage,
  ConfigPage,
  DashboardPage,
  MemoryPage,
  OnboardingPage,
  PromptsPage,
  SettingsPage,
  WorkflowsPage,
} from "@/pages";

const OnboardingGate: Component = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { preferences, ready, user } = useDb();

  createEffect(() => {
    // Wait for SQLite snapshot before deciding whether to redirect.
    if (!ready()) return;
    const completed = preferences()["onboarding.completed"] === "true" || user()?.onboarded;
    const skipped = preferences()["onboarding.skipped"] === "true";
    if (completed || skipped) return;
    if (location.pathname.startsWith("/onboarding")) return;
    navigate("/onboarding", { replace: true });
  });

  return null;
};

const ErrorFallback: Component<{ error: Error }> = (props) => {
  console.error("[App] Render error:", props.error);
  return (
    <div class="h-screen flex items-center justify-center bg-background text-foreground p-4">
      <div class="max-w-md text-center">
        <h1 class="text-xl font-semibold mb-2">Something went wrong</h1>
        <pre class="text-xs text-red-500 bg-muted p-2 rounded overflow-auto max-h-40">{props.error.message}</pre>
      </div>
    </div>
  );
};

// Layout wrapper that provides shared navigation
const LayoutWrapper: Component<{ children?: JSX.Element }> = (props) => {
  return (
    <AppLayout>
      <OnboardingGate />
      {props.children}
    </AppLayout>
  );
};

export const App: Component = () => {
  console.log("[App] Rendering App component");
  const openCodeBase = resolveOpenCodeBase();
  const agentsBase = resolveAgentsBase();

  return (
    <ErrorBoundary fallback={(err) => <ErrorFallback error={err} />}>
      <OpenCodeProvider baseUrl={openCodeBase}>
        <AgentsProvider baseUrl={agentsBase}>
          <DbProvider baseUrl={agentsBase}>
            <LayoutProvider>
              <Router root={LayoutWrapper}>
                {/* Redirect root to dashboard */}
                <Route path="/" component={() => <Navigate href="/dashboard" />} />

                {/* Main pages */}
                <Route path="/dashboard" component={DashboardPage} />
                <Route path="/workflows" component={WorkflowsPage} />
                <Route path="/memory" component={MemoryPage} />
                <Route path="/config" component={ConfigPage} />
                <Route path="/prompts" component={PromptsPage} />
                <Route path="/chat" component={ChatPage} />
                <Route path="/agents" component={AgentsPage} />
                <Route path="/settings" component={SettingsPage} />
                <Route path="/onboarding" component={OnboardingPage} />

                {/* Fallback - redirect unknown routes to dashboard */}
                <Route path="*" component={() => <Navigate href="/dashboard" />} />
              </Router>
            </LayoutProvider>
          </DbProvider>
        </AgentsProvider>
      </OpenCodeProvider>
    </ErrorBoundary>
  );
};
