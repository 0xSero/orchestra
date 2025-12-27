/**
 * Agents Page - Unified agents/skills view
 */

import type { Component } from "solid-js";
import { SkillList, SkillsWorkspace } from "@/components/skills";

export const AgentsPage: Component = () => {
  return (
    <div class="agents-shell">
      <aside class="skills-sidebar">
        <SkillList />
      </aside>

      <div class="skills-workspace">
        <SkillsWorkspace />
      </div>
    </div>
  );
};
