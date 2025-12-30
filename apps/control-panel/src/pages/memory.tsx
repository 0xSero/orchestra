/**
 * Memory Page - Inspect orchestrator memory writes
 */

import { type Component, createMemo, createSignal, For, Show } from "solid-js";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useOpenCode } from "@/context/opencode";
import { parseOrchestratorEvent } from "@/context/opencode-helpers";
import type { OrchestratorEvent } from "@/context/opencode-types";
import { formatRelativeTime } from "@/lib/utils";

const asString = (value: unknown) => (typeof value === "string" ? value : "");
const asStringArray = (value: unknown) => (Array.isArray(value) ? value.map(String) : []);

export const MemoryPage: Component = () => {
  const { events } = useOpenCode();
  const [query, setQuery] = createSignal("");

  const memoryWrites = createMemo(() =>
    events()
      .map((item) => parseOrchestratorEvent(item.payload))
      .filter((event): event is OrchestratorEvent => Boolean(event) && event.type === "orchestra.memory.written")
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
    <div class="flex-1 flex flex-col overflow-hidden">
      <header class="px-6 py-5 border-b border-border">
        <h1 class="text-2xl font-semibold text-foreground">Memory</h1>
        <p class="text-sm text-muted-foreground">
          Browse recent memory writes and search by key, tag, or scope.
        </p>
      </header>

      <div class="flex-1 overflow-auto">
        <div class="p-6 space-y-6">
          <div class="grid gap-4 md:grid-cols-3">
            <Card>
              <CardHeader>
                <CardTitle class="text-sm text-muted-foreground">Writes</CardTitle>
              </CardHeader>
              <CardContent class="text-2xl font-semibold">{stats().total}</CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle class="text-sm text-muted-foreground">Unique Keys</CardTitle>
              </CardHeader>
              <CardContent class="text-2xl font-semibold">{stats().keys}</CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle class="text-sm text-muted-foreground">Tags</CardTitle>
              </CardHeader>
              <CardContent class="text-2xl font-semibold">{stats().tags}</CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Search Memory</CardTitle>
              <CardDescription>Filter by key, tag, scope, or task ID.</CardDescription>
            </CardHeader>
            <CardContent>
              <Input
                placeholder="Search memory writes..."
                value={query()}
                onInput={(e) => setQuery(e.currentTarget.value)}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Recent Writes</CardTitle>
              <CardDescription>Latest memory updates captured from the orchestrator stream.</CardDescription>
            </CardHeader>
            <CardContent class="space-y-3 text-sm">
              <Show
                when={filteredWrites().length > 0}
                fallback={<div class="text-sm text-muted-foreground">No memory writes found.</div>}
              >
                <For each={filteredWrites().slice(0, 24)}>
                  {(event) => {
                    const data = event.data;
                    const tags = asStringArray(data.tags);
                    return (
                      <div class="rounded-md border border-border/60 bg-card/70 px-3 py-2">
                        <div class="flex items-center justify-between text-xs text-muted-foreground">
                          <span>{asString(data.scope) || "scope"}</span>
                          <span>{formatRelativeTime(event.timestamp)}</span>
                        </div>
                        <div class="text-sm font-medium text-foreground">{asString(data.key) || "Memory update"}</div>
                        <div class="text-xs text-muted-foreground">
                          {asString(data.action)} · {asString(data.projectId) || "project"} ·{" "}
                          {asString(data.taskId) || "task"}
                        </div>
                        <Show when={tags.length > 0}>
                          <div class="mt-2 flex flex-wrap gap-2">
                            <For each={tags}>{(tag) => <Badge variant="secondary">{tag}</Badge>}</For>
                          </div>
                        </Show>
                      </div>
                    );
                  }}
                </For>
              </Show>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};
