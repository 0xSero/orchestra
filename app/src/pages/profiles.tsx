/**
 * Profiles Page - Skills/Recipes management (previously "Skills" tab)
 */

import type { Component } from "solid-js";
import { SkillList, SkillsWorkspace } from "@/components/skills";

export const ProfilesPage: Component = () => {
  return (
    <>
      {/* Skills sidebar */}
      <aside class="w-64 border-r border-border overflow-hidden">
        <SkillList />
      </aside>

      {/* Skills workspace */}
      <div class="flex-1 overflow-auto">
        <SkillsWorkspace />
      </div>
    </>
  );
};
