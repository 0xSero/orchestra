/**
 * Automation Hub - Unified view for Workflows, Profiles, Skills, and Prompts
 *
 * Central hub for all automation components:
 * - Workflows: Multi-step task pipelines
 * - Profiles: Model + capability combinations (workers)
 * - Skills: Reusable tool/prompt packages from multiple sources
 * - Prompts: System prompts and agent configurations
 */

import { A, useLocation } from "@solidjs/router";
import { type Component, createMemo, For, type JSX, Show } from "solid-js";
import { useOpenCode } from "@/context/opencode";

// Tab icons
const WorkflowsIcon: Component = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M3 7h6M3 17h6M15 7h6M15 17h6M9 7a3 3 0 0 1 6 0M9 17a3 3 0 0 0 6 0" />
  </svg>
);

const ProfilesIcon: Component = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>
);

const SkillsIcon: Component = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M12 3l2.3 4.6L19 8l-3.5 3.4L16.6 16 12 13.5 7.4 16l1.1-4.6L5 8l4.7-.4L12 3Z" />
  </svg>
);

const PromptsIcon: Component = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M4 6h16M4 12h16M4 18h10" />
  </svg>
);

type AutomationLayoutProps = {
  children: JSX.Element;
};

type TabDef = {
  path: string;
  label: string;
  icon: Component;
  description: string;
};

export const AutomationLayout: Component<AutomationLayoutProps> = (props) => {
  const location = useLocation();
  const { connected, workflowRuns, skillEvents } = useOpenCode();

  const isActive = (path: string) => location.pathname.startsWith(path);

  const tabs: TabDef[] = [
    {
      path: "/automation/workflows",
      label: "Workflows",
      icon: WorkflowsIcon,
      description: "Multi-step task pipelines",
    },
    {
      path: "/automation/profiles",
      label: "Profiles",
      icon: ProfilesIcon,
      description: "Model + capability configs",
    },
    {
      path: "/automation/skills",
      label: "Skills",
      icon: SkillsIcon,
      description: "Reusable tools & prompts",
    },
    {
      path: "/automation/prompts",
      label: "Prompts",
      icon: PromptsIcon,
      description: "System prompts",
    },
  ];

  // Stats for the header
  const activeWorkflows = createMemo(() =>
    workflowRuns().filter((r) => r.status === "running").length
  );
  const recentSkills = createMemo(() => {
    const oneHourAgo = Date.now() - 3600000;
    return new Set(
      skillEvents()
        .filter((e) => e.timestamp > oneHourAgo)
        .map((e) => e.skillName)
        .filter(Boolean)
    ).size;
  });

  return (
    <div class="flex-1 flex flex-col overflow-hidden">
      {/* Header with stats */}
      <div class="border-b border-border">
        <div class="px-6 py-4">
          <div class="flex items-start justify-between">
            <div>
              <h1 class="text-2xl font-semibold text-foreground">Automation</h1>
              <p class="text-sm text-muted-foreground">
                Manage workflows, profiles, skills, and prompts for your orchestrator.
              </p>
            </div>

            {/* Quick stats */}
            <div class="flex items-center gap-4">
              <Show when={activeWorkflows() > 0}>
                <div class="flex items-center gap-2 px-3 py-1.5 bg-status-busy/10 rounded-full">
                  <span class="w-2 h-2 rounded-full bg-status-busy animate-pulse" />
                  <span class="text-xs font-medium text-status-busy">
                    {activeWorkflows()} active
                  </span>
                </div>
              </Show>
              <Show when={recentSkills() > 0}>
                <div class="flex items-center gap-2 px-3 py-1.5 bg-muted rounded-full">
                  <SkillsIcon />
                  <span class="text-xs font-medium text-muted-foreground">
                    {recentSkills()} skills used (1h)
                  </span>
                </div>
              </Show>
              <div
                class="flex items-center gap-2 px-3 py-1.5 rounded-full"
                classList={{
                  "bg-status-ready/10": connected(),
                  "bg-status-error/10": !connected(),
                }}
              >
                <span
                  class="w-2 h-2 rounded-full"
                  classList={{
                    "bg-status-ready": connected(),
                    "bg-status-error": !connected(),
                  }}
                />
                <span
                  class="text-xs font-medium"
                  classList={{
                    "text-status-ready": connected(),
                    "text-status-error": !connected(),
                  }}
                >
                  {connected() ? "Connected" : "Offline"}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Tab navigation */}
        <div class="px-6 flex items-center gap-1">
          <For each={tabs}>
            {(tab) => {
              const Icon = tab.icon;
              return (
                <A
                  href={tab.path}
                  class="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-t-md transition-colors"
                  classList={{
                    "text-foreground bg-background border-t border-l border-r border-border": isActive(tab.path),
                    "text-muted-foreground hover:text-foreground hover:bg-accent/30": !isActive(tab.path),
                  }}
                  title={tab.description}
                >
                  <Icon />
                  {tab.label}
                </A>
              );
            }}
          </For>
        </div>
      </div>

      {/* Content */}
      <div class="flex-1 overflow-hidden">{props.children}</div>
    </div>
  );
};
