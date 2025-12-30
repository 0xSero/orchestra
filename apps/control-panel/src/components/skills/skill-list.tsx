import { createMemo, createSignal, For, Show } from "solid-js";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAgents } from "@/context/agents";
import { AgentCard } from "./skill-card";
import { AgentCreateDialog } from "./skill-create-dialog";

const PlusIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
  >
    <path d="M5 12h14" />
    <path d="M12 5v14" />
  </svg>
);

export function AgentList() {
  const { agents, isLoading, selectedAgentId, selectAgent, openCreateDialog, closeCreateDialog, createDialogOpen } =
    useAgents();
  const [search, setSearch] = createSignal("");

  const filteredAgents = createMemo(() => {
    const list = agents();
    const query = search().trim().toLowerCase();
    if (!query) return list;
    return list.filter(
      (agent) => agent.id.toLowerCase().includes(query) || agent.frontmatter.description.toLowerCase().includes(query),
    );
  });

  return (
    <div class="skills-sidebar-inner">
      <div class="skills-header">
        <div>
          <p class="skills-eyebrow">Agents</p>
          <div class="flex items-center gap-2">
            <h2 class="skills-title">Profiles</h2>
            <span class="skills-count">{agents().length}</span>
          </div>
          <p class="skills-subtitle">Local agents + shared profiles</p>
        </div>
        <Button variant="secondary" size="sm" class="skills-new-btn" onClick={openCreateDialog}>
          <PlusIcon />
          New
        </Button>
      </div>

      <div class="skills-search">
        <Input placeholder="Search agents..." value={search()} onInput={(e) => setSearch(e.currentTarget.value)} />
      </div>

      <ScrollArea class="skills-list">
        <div class="skills-list-inner">
          <Show when={!isLoading()} fallback={<div class="skills-muted">Loading profiles...</div>}>
          <Show when={filteredAgents().length > 0} fallback={<div class="skills-muted">No profiles found</div>}>
              <For each={filteredAgents()}>
                {(agent) => (
                  <AgentCard
                    agent={agent}
                    selected={selectedAgentId() === agent.id}
                    onClick={() => selectAgent(agent.id)}
                  />
                )}
              </For>
            </Show>
          </Show>
        </div>
      </ScrollArea>

      <AgentCreateDialog open={createDialogOpen()} onClose={closeCreateDialog} />
    </div>
  );
}
