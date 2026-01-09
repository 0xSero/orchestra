/**
 * App Component - Root application with providers
 *
 * Connects to OpenCode server (localhost:4096) for session/agent data.
 * Uses the OpenCode SDK for session/agent data.
 */

import { Navigate, Route, Router } from "@solidjs/router";
import { type Component, ErrorBoundary, type JSX } from "solid-js";
import { AppShell } from "@/components/layout/app-shell";
import { DbProvider } from "@/context/db";
import { LayoutProvider } from "@/context/layout";
import { OpenCodeProvider } from "@/context/opencode";
import { AgentsProvider } from "@/context/agents";
import { resolveAgentsBase, resolveOpenCodeBase } from "@/lib/opencode-base";
import {
  AgentsPage,
  ChatPage,
  DashboardPage,
  MemoryPage,
  ObservabilityPage,
  PromptsPage,
  SkillsPage,
  SettingsPage,
  TasksKanbanPage,
  WorkflowsPage,
} from "@/pages";
import { OpenBoardRoute } from "@/components/openboard-seam";

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
    <AppShell>
      {props.children}
    </AppShell>
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
                <Route path="/tasks" component={TasksKanbanPage} />
                <Route path="/workers" component={DashboardPage} /> {/* Placeholder - will create dedicated page */}
                <Route path="/memory" component={MemoryPage} />
                <Route path="/chat" component={ChatPage} />

                {/* Automation hub - redirect legacy routes */}
                <Route path="/automation/workflows" component={WorkflowsPage} />
                <Route path="/automation/skills" component={SkillsPage} />
                <Route path="/automation/prompts" component={PromptsPage} />
                <Route path="/automation" component={() => <Navigate href="/automation/workflows" />} />

                {/* Legacy route redirects for backward compatibility */}
                <Route path="/workflows" component={() => <Navigate href="/automation/workflows" />} />
                <Route path="/skills" component={() => <Navigate href="/automation/skills" />} />
                <Route path="/prompts" component={() => <Navigate href="/automation/prompts" />} />
                <Route path="/compose" component={() => <Navigate href="/tasks" />} />

                {/* Observe - map /observe and /observability to same page */}
                <Route path="/observe" component={ObservabilityPage} />
                <Route path="/observability" component={ObservabilityPage} />

                {/* Settings - merge config into settings */}
                <Route path="/settings" component={SettingsPage} />
                <Route path="/config" component={() => <Navigate href="/settings" />} />

                {/* Other pages */}
                <Route path="/agents" component={AgentsPage} />

                {/* OpenBoard integration seam */}
                <Route path="/openboard/*" component={OpenBoardRoute} />

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
