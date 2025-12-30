import type { Component } from "solid-js";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { AgentProfile } from "@/types/agent";

const sourceLabel = (agent: AgentProfile) => {
  if (agent.source.type === "builtin") return "Built-in";
  if (agent.source.type === "global") return "Global";
  return "Project";
};

export const AgentCard: Component<{
  agent: AgentProfile;
  selected?: boolean;
  onClick?: () => void;
}> = (props) => {
  return (
    <button
      class={cn("skill-item", "focus:outline-none focus:ring-2 focus:ring-ring/30", props.selected && "selected")}
      onClick={props.onClick}
    >
      <div class="skill-item-header">
        <h3 class="skill-item-title">{props.agent.id}</h3>
        <Badge variant="secondary" class="skill-item-badge">
          {sourceLabel(props.agent)}
        </Badge>
      </div>
      <p class="skill-item-desc">{props.agent.frontmatter.description}</p>
      <div class="skill-item-meta">
        <span class="skill-item-model">{props.agent.frontmatter.model}</span>
        <span class="skill-item-dot" />
        <span class="skill-item-hint">Editable</span>
      </div>
    </button>
  );
};
