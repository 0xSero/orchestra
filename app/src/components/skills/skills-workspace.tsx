import { Show } from "solid-js";
import { useSkills } from "@/context/skills";
import { SkillEditor } from "./skill-editor";

export function SkillsWorkspace() {
  const { selectedSkillId, selectSkill } = useSkills();

  return (
    <Show
      when={selectedSkillId()}
      fallback={
        <div class="skills-empty">
          <div class="skills-empty-card">
            <div class="skills-empty-icon">◎</div>
            <div>
              <h3 class="skills-empty-title">Select an agent profile</h3>
              <p class="skills-empty-subtitle">
                Choose a profile from the left to edit prompts, tools, and permissions.
              </p>
            </div>
          </div>
        </div>
      }
    >
      {(id) => <SkillEditor skillId={id()} onClose={() => selectSkill(null)} />}
    </Show>
  );
}
