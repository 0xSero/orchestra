/**
 * Agents Page - Unified agent profile view
 */

import type { Component } from "solid-js";
import { AgentList, AgentsWorkspace } from "@/components/skills";

export const AgentsPage: Component = () => {
  return (
    <div class="flex-1 flex flex-col overflow-hidden">
      <header class="px-6 py-5 border-b border-border">
        <h1 class="text-2xl font-semibold text-foreground">Agents</h1>
        <p class="text-sm text-muted-foreground">
          Manage agent profiles, prompts, tools, and permissions in one workspace.
        </p>
      </header>

      <div class="agents-shell">
        <aside class="skills-sidebar">
          <AgentList />
        </aside>

        <div class="skills-workspace">
          <AgentsWorkspace />
        </div>
      </div>
    </div>
  );
};
