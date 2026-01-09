/**
 * Memory Page - Memory configuration and write events
 */

import { type Component, createMemo, createSignal, For, Show } from "solid-js";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Drawer } from "@/components/ui/drawer";
import { useOpenCode } from "@/context/opencode";
import { parseOrchestratorEvent } from "@/context/opencode-helpers";
import type { OrchestratorEvent } from "@/context/opencode-types";
import { formatRelativeTime } from "@/lib/utils";
import { ORCHESTRATOR_MEMORY_CONFIG } from "@/lib/orchestrator-config";

const asString = (value: unknown) => (typeof value === "string" ? value : "");
const asStringArray = (value: unknown) => (Array.isArray(value) ? value.map(String) : []);

export const MemoryPage: Component = () => {
  const { events } = useOpenCode();
  const [query, setQuery] = createSignal("");
  const [selectedEvent, setSelectedEvent] = createSignal<OrchestratorEvent | null>(null);

  const memoryWrites = createMemo(() =>
    events()
      .map((item) => parseOrchestratorEvent(item.payload))
      .filter((event): event is OrchestratorEvent => event != null && event.type === "orchestra.memory.written")
      .sort((a, b) => b.timestamp - a.timestamp),
  );

  const filteredWrites = createMemo(() => {
    const q = query().trim().toLowerCase();
    if (!q) return memoryWrites();
    return memoryWrites().filter((event) => {
      const data = event.data;
      const haystack = [
        asString(data.action),
        asString(data.scope),
        asString(data.projectId),
        asString(data.taskId),
        asString(data.key),
        ...asStringArray(data.tags),
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  });

  const stats = createMemo(() => {
    const all = memoryWrites();
    const keys = new Set<string>();
    const tags = new Set<string>();
    for (const event of all) {
      const data = event.data;
      const key = asString(data.key);
      if (key) keys.add(key);
      for (const tag of asStringArray(data.tags)) {
        tags.add(tag);
      }
    }
    return { total: all.length, keys: keys.size, tags: tags.size };
  });

  return (
    <div class="h-full overflow-auto">
      <div class="p-6 space-y-6">
        {/* Header */}
        <header>
          <h1 class="text-2xl font-semibold text-foreground">Memory</h1>
          <p class="text-sm text-muted-foreground">Memory configuration and write events</p>
        </header>

        {/* Quick Stats */}
        <div class="flex items-center gap-6 text-sm">
          <div>
            <span class="text-muted-foreground">Total Writes:</span>{" "}
            <span class="font-semibold text-foreground">{stats().total}</span>
          </div>
          <div>
            <span class="text-muted-foreground">Unique Keys:</span>{" "}
            <span class="font-semibold text-foreground">{stats().keys}</span>
          </div>
          <div>
            <span class="text-muted-foreground">Tags:</span>{" "}
            <span class="font-semibold text-foreground">{stats().tags}</span>
          </div>
          <div>
            <span class="text-muted-foreground">Status:</span>{" "}
            <Badge variant={ORCHESTRATOR_MEMORY_CONFIG.enabled ? "ready" : "secondary"}>
              {ORCHESTRATOR_MEMORY_CONFIG.enabled ? "enabled" : "disabled"}
            </Badge>
          </div>
        </div>

        {/* Memory Configuration */}
        <section>
          <h2 class="text-sm font-semibold text-foreground mb-3">Configuration</h2>
          <div class="border border-border rounded-md overflow-hidden">
            <table class="w-full text-sm">
              <thead class="bg-muted/50 text-xs text-muted-foreground">
                <tr>
                  <th class="text-left px-3 py-2 font-medium">Setting</th>
                  <th class="text-left px-3 py-2 font-medium">Value</th>
                  <th class="text-left px-3 py-2 font-medium">Description</th>
                </tr>
              </thead>
              <tbody class="text-xs">
                <tr class="border-t border-border hover:bg-muted/20">
                  <td class="px-3 py-2 font-medium text-foreground">Auto Record</td>
                  <td class="px-3 py-2">
                    <Badge variant={ORCHESTRATOR_MEMORY_CONFIG.autoRecord ? "ready" : "secondary"}>
                      {ORCHESTRATOR_MEMORY_CONFIG.autoRecord ? "on" : "off"}
                    </Badge>
                  </td>
                  <td class="px-3 py-2 text-muted-foreground">Automatically record conversation context</td>
                </tr>
                <tr class="border-t border-border hover:bg-muted/20">
                  <td class="px-3 py-2 font-medium text-foreground">Auto Inject</td>
                  <td class="px-3 py-2">
                    <Badge variant={ORCHESTRATOR_MEMORY_CONFIG.autoInject ? "ready" : "secondary"}>
                      {ORCHESTRATOR_MEMORY_CONFIG.autoInject ? "on" : "off"}
                    </Badge>
                  </td>
                  <td class="px-3 py-2 text-muted-foreground">Inject relevant memory into conversations</td>
                </tr>
                <tr class="border-t border-border hover:bg-muted/20">
                  <td class="px-3 py-2 font-medium text-foreground">Scope</td>
                  <td class="px-3 py-2 font-mono text-muted-foreground">{ORCHESTRATOR_MEMORY_CONFIG.scope}</td>
                  <td class="px-3 py-2 text-muted-foreground">Memory isolation level</td>
                </tr>
                <tr class="border-t border-border hover:bg-muted/20">
                  <td class="px-3 py-2 font-medium text-foreground">Max Chars</td>
                  <td class="px-3 py-2 font-mono text-muted-foreground">{ORCHESTRATOR_MEMORY_CONFIG.maxChars}</td>
                  <td class="px-3 py-2 text-muted-foreground">Maximum characters per memory entry</td>
                </tr>
                <tr class="border-t border-border hover:bg-muted/20">
                  <td class="px-3 py-2 font-medium text-foreground">Session Summary Max</td>
                  <td class="px-3 py-2 font-mono text-muted-foreground">{ORCHESTRATOR_MEMORY_CONFIG.summaries.sessionMaxChars}</td>
                  <td class="px-3 py-2 text-muted-foreground">Max chars for session summaries</td>
                </tr>
                <tr class="border-t border-border hover:bg-muted/20">
                  <td class="px-3 py-2 font-medium text-foreground">Project Summary Max</td>
                  <td class="px-3 py-2 font-mono text-muted-foreground">{ORCHESTRATOR_MEMORY_CONFIG.summaries.projectMaxChars}</td>
                  <td class="px-3 py-2 text-muted-foreground">Max chars for project summaries</td>
                </tr>
                <tr class="border-t border-border hover:bg-muted/20">
                  <td class="px-3 py-2 font-medium text-foreground">Messages/Session</td>
                  <td class="px-3 py-2 font-mono text-muted-foreground">{ORCHESTRATOR_MEMORY_CONFIG.trim.maxMessagesPerSession}</td>
                  <td class="px-3 py-2 text-muted-foreground">Max messages retained per session</td>
                </tr>
                <tr class="border-t border-border hover:bg-muted/20">
                  <td class="px-3 py-2 font-medium text-foreground">Messages/Project</td>
                  <td class="px-3 py-2 font-mono text-muted-foreground">{ORCHESTRATOR_MEMORY_CONFIG.trim.maxMessagesPerProject}</td>
                  <td class="px-3 py-2 text-muted-foreground">Max messages retained per project</td>
                </tr>
                <tr class="border-t border-border hover:bg-muted/20">
                  <td class="px-3 py-2 font-medium text-foreground">Messages Global</td>
                  <td class="px-3 py-2 font-mono text-muted-foreground">{ORCHESTRATOR_MEMORY_CONFIG.trim.maxMessagesGlobal}</td>
                  <td class="px-3 py-2 text-muted-foreground">Max messages across all projects</td>
                </tr>
                <tr class="border-t border-border hover:bg-muted/20">
                  <td class="px-3 py-2 font-medium text-foreground">Max Projects</td>
                  <td class="px-3 py-2 font-mono text-muted-foreground">{ORCHESTRATOR_MEMORY_CONFIG.trim.maxProjectsGlobal}</td>
                  <td class="px-3 py-2 text-muted-foreground">Maximum projects tracked globally</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        {/* Search */}
        <div class="flex items-center gap-3">
          <Input
            placeholder="Search memory writes by key, tag, scope, or task ID..."
            value={query()}
            onInput={(e) => setQuery(e.currentTarget.value)}
            class="max-w-md"
          />
          <Show when={query()}>
            <button
              type="button"
              onClick={() => setQuery("")}
              class="text-xs text-muted-foreground hover:text-foreground"
            >
              Clear
            </button>
          </Show>
        </div>

        {/* Memory Writes Table */}
        <section>
          <h2 class="text-sm font-semibold text-foreground mb-3">Recent Writes</h2>
          <div class="border border-border rounded-md overflow-hidden">
            <table class="w-full text-sm">
              <thead class="bg-muted/50 text-xs text-muted-foreground">
                <tr>
                  <th class="text-left px-3 py-2 font-medium">Key</th>
                  <th class="text-left px-3 py-2 font-medium">Action</th>
                  <th class="text-left px-3 py-2 font-medium">Scope</th>
                  <th class="text-left px-3 py-2 font-medium">Project</th>
                  <th class="text-left px-3 py-2 font-medium">Task</th>
                  <th class="text-left px-3 py-2 font-medium">Tags</th>
                  <th class="text-left px-3 py-2 font-medium">Time</th>
                </tr>
              </thead>
              <tbody class="text-xs">
                <Show
                  when={filteredWrites().length > 0}
                  fallback={
                    <tr>
                      <td colspan="7" class="text-center py-8 text-muted-foreground">
                        <div class="text-2xl mb-2">💾</div>
                        <p>No memory writes yet</p>
                        <p class="text-xs mt-1">Memory writes will appear here when the orchestrator records context</p>
                      </td>
                    </tr>
                  }
                >
                  <For each={filteredWrites().slice(0, 50)}>
                    {(event) => {
                      const data = event.data;
                      const tags = asStringArray(data.tags);
                      return (
                        <tr
                          class="border-t border-border hover:bg-muted/20 cursor-pointer"
                          onClick={() => setSelectedEvent(event)}
                        >
                          <td class="px-3 py-2 font-medium text-foreground max-w-xs truncate">
                            {asString(data.key) || "—"}
                          </td>
                          <td class="px-3 py-2 text-muted-foreground">{asString(data.action) || "—"}</td>
                          <td class="px-3 py-2 text-muted-foreground">{asString(data.scope) || "—"}</td>
                          <td class="px-3 py-2 font-mono text-muted-foreground text-xs truncate max-w-xs">
                            {asString(data.projectId) || "—"}
                          </td>
                          <td class="px-3 py-2 font-mono text-muted-foreground text-xs truncate max-w-xs">
                            {asString(data.taskId) || "—"}
                          </td>
                          <td class="px-3 py-2">
                            <Show when={tags.length > 0}>
                              <div class="flex flex-wrap gap-1">
                                <For each={tags.slice(0, 3)}>
                                  {(tag) => (
                                    <span class="text-[10px] px-1.5 py-0.5 bg-muted rounded">{tag}</span>
                                  )}
                                </For>
                                <Show when={tags.length > 3}>
                                  <span class="text-[10px] px-1.5 py-0.5 text-muted-foreground">
                                    +{tags.length - 3}
                                  </span>
                                </Show>
                              </div>
                            </Show>
                          </td>
                          <td class="px-3 py-2 text-muted-foreground">{formatRelativeTime(event.timestamp)}</td>
                        </tr>
                      );
                    }}
                  </For>
                </Show>
              </tbody>
            </table>
          </div>
        </section>
      </div>

      {/* Memory detail drawer */}
      <Show when={selectedEvent()}>
        {(event) => (
          <Drawer
            open={selectedEvent() !== null}
            onClose={() => setSelectedEvent(null)}
            title={asString(event().data.key) || "Memory Write"}
            subtitle={`${asString(event().data.scope)} • ${formatRelativeTime(event().timestamp)}`}
          >
            <div class="space-y-4">
              <div>
                <h3 class="text-sm font-medium text-foreground mb-2">Action</h3>
                <p class="text-sm text-muted-foreground">{asString(event().data.action)}</p>
              </div>

              <Show when={asString(event().data.projectId)}>
                <div>
                  <h3 class="text-sm font-medium text-foreground mb-2">Project ID</h3>
                  <p class="text-sm text-muted-foreground font-mono">{asString(event().data.projectId)}</p>
                </div>
              </Show>

              <Show when={asString(event().data.taskId)}>
                <div>
                  <h3 class="text-sm font-medium text-foreground mb-2">Task ID</h3>
                  <p class="text-sm text-muted-foreground font-mono">{asString(event().data.taskId)}</p>
                </div>
              </Show>

              <Show when={asStringArray(event().data.tags).length > 0}>
                <div>
                  <h3 class="text-sm font-medium text-foreground mb-2">Tags</h3>
                  <div class="flex flex-wrap gap-2">
                    <For each={asStringArray(event().data.tags)}>
                      {(tag) => <Badge variant="secondary">{tag}</Badge>}
                    </For>
                  </div>
                </div>
              </Show>

              <div>
                <h3 class="text-sm font-medium text-foreground mb-2">Full Data</h3>
                <pre class="p-3 bg-muted rounded-md text-xs overflow-x-auto">
{JSON.stringify(event().data, null, 2)}
                </pre>
              </div>

              <div>
                <h3 class="text-sm font-medium text-foreground mb-2">Timestamp</h3>
                <p class="text-sm text-muted-foreground">
                  {new Date(event().timestamp).toLocaleString()}
                </p>
              </div>
            </div>
          </Drawer>
        )}
      </Show>
    </div>
  );
};
