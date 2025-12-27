import type { Component } from "solid-js";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { Skill } from "@/types/skill";

const sourceLabel = (skill: Skill) => {
  if (skill.source.type === "builtin") return "Built-in";
  if (skill.source.type === "global") return "Global";
  return "Project";
};

export const SkillCard: Component<{
  skill: Skill;
  selected?: boolean;
  onClick?: () => void;
}> = (props) => {
  return (
    <button
      class={cn("skill-item", "focus:outline-none focus:ring-2 focus:ring-ring/30", props.selected && "selected")}
      onClick={props.onClick}
    >
      <div class="skill-item-header">
        <h3 class="skill-item-title">{props.skill.id}</h3>
        <Badge variant="secondary" class="skill-item-badge">
          {sourceLabel(props.skill)}
        </Badge>
      </div>
      <p class="skill-item-desc">{props.skill.frontmatter.description}</p>
      <div class="skill-item-meta">
        <span class="skill-item-model">{props.skill.frontmatter.model}</span>
        <span class="skill-item-dot" />
        <span class="skill-item-hint">Editable</span>
      </div>
    </button>
  );
};
