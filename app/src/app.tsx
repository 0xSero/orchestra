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
import { SkillsProvider } from "@/context/skills";
import { resolveOpenCodeBase, resolveSkillsBase } from "@/lib/opencode-base";
import { AgentsPage, ChatPage, LogsPage, OnboardingPage, SettingsPage, SystemPage } from "@/pages";

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
  const skillsBase = resolveSkillsBase();

  return (
    <ErrorBoundary fallback={(err) => <ErrorFallback error={err} />}>
      <OpenCodeProvider baseUrl={openCodeBase}>
        <SkillsProvider baseUrl={skillsBase}>
          <DbProvider baseUrl={skillsBase}>
            <LayoutProvider>
              <Router root={LayoutWrapper}>
                {/* Redirect root to chat */}
                <Route path="/" component={() => <Navigate href="/chat" />} />

                {/* Main pages */}
                <Route path="/chat" component={ChatPage} />
                <Route path="/agents" component={AgentsPage} />
                <Route path="/profiles" component={() => <Navigate href="/agents" />} />
                <Route path="/logs" component={LogsPage} />
                <Route path="/system" component={SystemPage} />
                <Route path="/settings" component={SettingsPage} />
                <Route path="/onboarding" component={OnboardingPage} />

                {/* Fallback - redirect unknown routes to chat */}
                <Route path="*" component={() => <Navigate href="/chat" />} />
              </Router>
            </LayoutProvider>
          </DbProvider>
        </SkillsProvider>
      </OpenCodeProvider>
    </ErrorBoundary>
  );
};
