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
      <div class="flex items-center justify-between gap-2">
        <h3 class="text-sm font-medium text-foreground">{props.skill.id}</h3>
        <Badge variant="secondary" class="text-[10px] uppercase tracking-wide">
          {sourceLabel(props.skill)}
        </Badge>
      </div>
      <p class="mt-1 text-xs text-muted-foreground truncate">{props.skill.frontmatter.description}</p>
      <div class="mt-2 text-[10px] text-muted-foreground">{props.skill.frontmatter.model}</div>
    </button>
  );
};
