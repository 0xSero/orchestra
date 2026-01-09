/**
 * Automation Hub - Unified view for Skills, Workflows, and Prompts
 */

import { A, useLocation } from "@solidjs/router";
import { type Component, type JSX } from "solid-js";

type AutomationLayoutProps = {
  children: JSX.Element;
};

export const AutomationLayout: Component<AutomationLayoutProps> = (props) => {
  const location = useLocation();

  const isActive = (path: string) => location.pathname.startsWith(path);

  const tabs = [
    { path: "/automation/workflows", label: "Workflows" },
    { path: "/automation/skills", label: "Skills" },
    { path: "/automation/prompts", label: "Prompts" },
  ];

  return (
    <div class="flex-1 flex flex-col overflow-hidden">
      {/* Header with tabs */}
      <div class="border-b border-border">
        <div class="px-6 py-4">
          <h1 class="text-2xl font-semibold text-foreground">Automation</h1>
          <p class="text-sm text-muted-foreground">
            Manage workflows, skills, and prompts for your orchestrator.
          </p>
        </div>

        {/* Tab navigation */}
        <div class="px-6 flex items-center gap-1">
          {tabs.map((tab) => (
            <A
              href={tab.path}
              class="px-4 py-2 text-sm font-medium rounded-t-md transition-colors"
              classList={{
                "text-foreground bg-background border-t border-l border-r border-border": isActive(
                  tab.path
                ),
                "text-muted-foreground hover:text-foreground hover:bg-accent/30": !isActive(
                  tab.path
                ),
              }}
            >
              {tab.label}
            </A>
          ))}
        </div>
      </div>

      {/* Content */}
      <div class="flex-1 overflow-hidden">{props.children}</div>
    </div>
  );
};
