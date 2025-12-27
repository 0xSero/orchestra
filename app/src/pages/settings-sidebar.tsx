import { type Component, For, Show } from "solid-js";
import type { Skill } from "@/types/skill";

interface SettingsSidebarProps {
  skills: Skill[];
  selectedWorkerId: string | null;
  onSelectWorker: (id: string) => void;
}

/** Sidebar listing worker profiles for overrides. */
export const SettingsSidebar: Component<SettingsSidebarProps> = (props) => (
  <aside class="w-72 border-r border-border overflow-hidden flex flex-col bg-card/30">
    <div class="p-4 border-b border-border">
      <h2 class="text-sm font-semibold text-foreground mb-1">Worker Profiles</h2>
      <p class="text-xs text-muted-foreground">Select a worker to manage SQLite overrides.</p>
    </div>

    <div class="flex-1 overflow-auto scrollbar-thin">
      <For each={props.skills}>
        {(skill) => (
          <button
            class={`session-item w-full text-left ${props.selectedWorkerId === skill.id ? "selected" : ""}`}
            onClick={() => props.onSelectWorker(skill.id)}
          >
            <div class="session-item-header">
              <div class="flex items-center gap-2 min-w-0 flex-1">
                <span class="session-item-title">{skill.frontmatter.name ?? skill.id}</span>
              </div>
            </div>
            <div class="session-item-meta mt-1">
              <span class="truncate">{skill.frontmatter.model}</span>
            </div>
          </button>
        )}
      </For>

      <Show when={props.skills.length === 0}>
        <div class="empty-state py-12">
          <p class="empty-state-title">No skills loaded</p>
          <p class="empty-state-description">Add skills to manage overrides.</p>
        </div>
      </Show>
    </div>
  </aside>
);
