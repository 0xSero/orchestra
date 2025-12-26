import { Show } from "solid-js";
import { useSkills } from "@/context/skills";
import { SkillEditor } from "./skill-editor";

export function SkillsWorkspace() {
  const { selectedSkillId, selectSkill } = useSkills();

  return (
    <Show
      when={selectedSkillId()}
      fallback={
        <div class="flex h-full items-center justify-center text-sm text-muted-foreground">
          Select a recipe to view and edit its configuration.
        </div>
      }
    >
      {(id) => <SkillEditor skillId={id()} onClose={() => selectSkill(null)} />}
    </Show>
  );
}
