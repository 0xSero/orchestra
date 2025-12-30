import { Show } from "solid-js";
import { useAgents } from "@/context/agents";
import { AgentEditor } from "./skill-editor";

export function AgentsWorkspace() {
  const { selectedAgentId, selectAgent } = useAgents();

  return (
    <Show
      when={selectedAgentId()}
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
      {(id) => <AgentEditor agentId={id()} onClose={() => selectAgent(null)} />}
    </Show>
  );
}
