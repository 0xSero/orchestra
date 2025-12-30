/**
 * Prompts Page - Review orchestrator + worker prompt sources
 */

import { type Component, createMemo, createSignal, For, Show } from "solid-js";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useAgents } from "@/context/agents";
import { useOpenCode } from "@/context/opencode";
import { truncate } from "@/lib/utils";

type AgentRecord = Record<string, unknown>;

const asRecord = (value: unknown): value is AgentRecord => typeof value === "object" && value !== null;

const getAgentField = (agent: AgentRecord, key: string) => (typeof agent[key] === "string" ? agent[key] : "");

const getAgentPrompt = (agent: AgentRecord) => {
  for (const key of ["systemPrompt", "prompt", "instructions"]) {
    const value = agent[key];
    if (typeof value === "string" && value.trim()) return value;
  }
  return "";
};

export const PromptsPage: Component = () => {
  const { agents: openCodeAgents } = useOpenCode();
  const { agents: agentProfiles } = useAgents();
  const [query, setQuery] = createSignal("");

  const filteredOpenCode = createMemo(() => {
    const q = query().trim().toLowerCase();
    const list = openCodeAgents();
    if (!q) return list;
    return list.filter((agent) => {
      const record = asRecord(agent) ? (agent as AgentRecord) : {};
      return (
        getAgentField(record, "id").toLowerCase().includes(q) ||
        getAgentField(record, "name").toLowerCase().includes(q) ||
        getAgentPrompt(record).toLowerCase().includes(q)
      );
    });
  });

  const filteredProfiles = createMemo(() => {
    const q = query().trim().toLowerCase();
    const list = agentProfiles();
    if (!q) return list;
    return list.filter(
      (profile) =>
        profile.id.toLowerCase().includes(q) ||
        profile.frontmatter.description.toLowerCase().includes(q) ||
        profile.systemPrompt.toLowerCase().includes(q),
    );
  });

  return (
    <div class="flex-1 flex flex-col overflow-hidden">
      <header class="px-6 py-5 border-b border-border">
        <h1 class="text-2xl font-semibold text-foreground">Prompts</h1>
        <p class="text-sm text-muted-foreground">
          Review orchestrator prompts and worker profile instructions across the system.
        </p>
      </header>

      <div class="flex-1 overflow-auto">
        <div class="p-6 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Search Prompts</CardTitle>
              <CardDescription>Filter by agent name, ID, or prompt text.</CardDescription>
            </CardHeader>
            <CardContent>
              <Input
                placeholder="Search prompt sources..."
                value={query()}
                onInput={(e) => setQuery(e.currentTarget.value)}
              />
            </CardContent>
          </Card>

          <div class="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>OpenCode Agents</CardTitle>
                <CardDescription>Agents registered on the OpenCode server.</CardDescription>
              </CardHeader>
              <CardContent class="space-y-4 text-sm">
                <Show
                  when={filteredOpenCode().length > 0}
                  fallback={<div class="text-sm text-muted-foreground">No OpenCode agents found.</div>}
                >
                  <For each={filteredOpenCode()}>
                    {(agent) => {
                      const record = asRecord(agent) ? (agent as AgentRecord) : {};
                      const id = getAgentField(record, "id") || "agent";
                      const name = getAgentField(record, "name") || id;
                      const model = getAgentField(record, "model");
                      const prompt = getAgentPrompt(record);
                      return (
                        <div class="rounded-md border border-border/60 bg-card/70 px-3 py-2">
                          <div class="flex items-center justify-between">
                            <div>
                              <div class="font-medium text-foreground">{name}</div>
                              <div class="text-xs text-muted-foreground">ID: {id}</div>
                            </div>
                            <Show when={model}>
                              <Badge variant="secondary">{model}</Badge>
                            </Show>
                          </div>
                          <Show
                            when={prompt}
                            fallback={<div class="text-xs text-muted-foreground mt-2">No prompt visible.</div>}
                          >
                            <pre class="mt-2 whitespace-pre-wrap text-xs text-muted-foreground">
                              {truncate(prompt, 600)}
                            </pre>
                          </Show>
                        </div>
                      );
                    }}
                  </For>
                </Show>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Agent Profiles</CardTitle>
              <CardDescription>Local agent profiles loaded from disk.</CardDescription>
              </CardHeader>
              <CardContent class="space-y-4 text-sm">
                <Show
                  when={filteredProfiles().length > 0}
                  fallback={<div class="text-sm text-muted-foreground">No agent profiles loaded.</div>}
                >
                  <For each={filteredProfiles()}>
                    {(profile) => (
                      <div class="rounded-md border border-border/60 bg-card/70 px-3 py-2">
                        <div class="flex items-center justify-between">
                          <div>
                            <div class="font-medium text-foreground">{profile.id}</div>
                            <div class="text-xs text-muted-foreground">{profile.frontmatter.description}</div>
                          </div>
                          <Badge variant="secondary">{profile.source.type}</Badge>
                        </div>
                        <div class="mt-2 flex flex-wrap gap-2 text-xs">
                          <Badge variant="outline">{profile.frontmatter.model}</Badge>
                          <Show when={profile.frontmatter.supportsVision}>
                            <Badge variant="outline">Vision</Badge>
                          </Show>
                          <Show when={profile.frontmatter.supportsWeb}>
                            <Badge variant="outline">Web</Badge>
                          </Show>
                        </div>
                        <pre class="mt-2 whitespace-pre-wrap text-xs text-muted-foreground">
                          {truncate(profile.systemPrompt || "No system prompt set.", 600)}
                        </pre>
                      </div>
                    )}
                  </For>
                </Show>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
};
