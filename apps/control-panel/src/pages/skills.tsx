/**
 * Skills Page - Discover and inspect OpenCode skills
 */

import { type Component, createEffect, createMemo, createSignal, For, Show } from "solid-js";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useLayout } from "@/context/layout";
import { type SkillLoadEvent, useOpenCode } from "@/context/opencode";
import { formatRelativeTime } from "@/lib/utils";

type SkillInventoryItem = {
  name: string;
  description?: string;
  source?: string;
  path?: string;
  status?: string;
  permission?: string;
  errors?: string[];
};

type TextPart = { type?: string; text?: string };

type SkillStatusBadge = {
  label: string;
  variant: "ready" | "secondary" | "error" | "outline";
};

const asRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;
const asString = (value: unknown): string => (typeof value === "string" ? value : "");

const extractText = (parts: TextPart[] | undefined): string => {
  if (!parts || parts.length === 0) return "";
  return parts
    .filter((part) => part.type === "text" && typeof part.text === "string")
    .map((part) => part.text?.trim() ?? "")
    .filter(Boolean)
    .join("\n\n");
};

const formatSkillSource = (source?: string): string => {
  switch (source) {
    case "project":
      return ".opencode/skill";
    case "project-claude":
      return ".claude/skills";
    case "global":
      return "~/.config/opencode/skill";
    case "global-claude":
      return "~/.claude/skills";
    default:
      return source ?? "unknown";
  }
};

const getStatusBadge = (skill: SkillInventoryItem): SkillStatusBadge => {
  if (skill.status === "disabled") {
    return { label: "Tool disabled", variant: "error" };
  }
  if (skill.permission === "deny") {
    return { label: "Hidden (deny)", variant: "error" };
  }
  if (skill.status === "invalid") {
    return { label: "Invalid", variant: "error" };
  }
  if (skill.permission === "ask") {
    return { label: "Ask", variant: "secondary" };
  }
  return { label: "Discoverable", variant: "ready" };
};

export const SkillsPage: Component = () => {
  const { client, sessions, skillEvents, workers } = useOpenCode();
  const { selectedWorkerId } = useLayout();

  const [selectedSessionId, setSelectedSessionId] = createSignal<string | null>(null);
  const [skills, setSkills] = createSignal<SkillInventoryItem[]>([]);
  const [search, setSearch] = createSignal("");
  const [skillsLoading, setSkillsLoading] = createSignal(false);
  const [skillsError, setSkillsError] = createSignal<string | null>(null);
  const [lastRefresh, setLastRefresh] = createSignal<number | null>(null);
  const [includeGlobal, setIncludeGlobal] = createSignal(true);
  const [selectedSkillName, setSelectedSkillName] = createSignal<string | null>(null);

  const workerById = createMemo(() => new Map(workers().map((worker) => [worker.id, worker])));

  const lastLoadBySkill = createMemo(() => {
    const map = new Map<string, SkillLoadEvent>();
    for (const event of skillEvents()) {
      if (!event.skillName) continue;
      const existing = map.get(event.skillName);
      if (!existing || event.timestamp > existing.timestamp) {
        map.set(event.skillName, event);
      }
    }
    return map;
  });

  // Show skill load events from orchestrator even if no inventory loaded
  const skillsFromEvents = createMemo(() => {
    const seen = new Set<string>();
    const items: SkillInventoryItem[] = [];
    for (const event of skillEvents()) {
      if (!event.skillName || seen.has(event.skillName)) continue;
      seen.add(event.skillName);
      items.push({
        name: event.skillName,
        description: `Loaded ${event.type === "orchestra.skill.load.completed" ? "successfully" : "with errors"}`,
        source: event.source === "server" ? "server" : "in-process",
        status: event.status === "success" ? "loaded" : "error",
      });
    }
    return items;
  });

  const allSkills = createMemo(() => {
    const inventory = skills();
    if (inventory.length > 0) return inventory;
    return skillsFromEvents();
  });

  const filteredSkills = createMemo(() => {
    const query = search().trim().toLowerCase();
    if (!query) return allSkills();
    return allSkills().filter((skill) => {
      return (
        skill.name.toLowerCase().includes(query) ||
        (skill.description ?? "").toLowerCase().includes(query) ||
        (skill.source ?? "").toLowerCase().includes(query)
      );
    });
  });

  const selectedSkill = createMemo(() => {
    const name = selectedSkillName();
    if (!name) return undefined;
    return allSkills().find((skill) => skill.name === name);
  });

  createEffect(() => {
    const preferred = selectedWorkerId();
    if (!selectedSessionId() && preferred) {
      setSelectedSessionId(preferred);
      return;
    }
    if (!selectedSessionId() && sessions().length > 0) {
      setSelectedSessionId(sessions()[0].id);
    }
  });

  const normalizeSkills = (raw: unknown): SkillInventoryItem[] => {
    if (!Array.isArray(raw)) return [];
    const items: SkillInventoryItem[] = [];
    for (const item of raw) {
      if (!asRecord(item)) continue;
      const name = asString(item.name);
      if (!name) continue;
      const description = asString(item.description);
      const source = asString(item.source);
      const path = asString(item.path);
      const status = asString(item.status);
      const permission = asString(item.permission);
      const errors = Array.isArray(item.errors) ? item.errors.map(String) : undefined;
      const entry: SkillInventoryItem = { name };
      if (description) entry.description = description;
      if (source) entry.source = source;
      if (path) entry.path = path;
      if (status) entry.status = status;
      if (permission) entry.permission = permission;
      if (errors && errors.length > 0) entry.errors = errors;
      items.push(entry);
    }
    items.sort((a, b) => a.name.localeCompare(b.name));
    return items;
  };

  const loadSkills = async () => {
    const sessionId = selectedSessionId();
    if (!sessionId) {
      setSkillsError("Select a session to list skills.");
      return;
    }
    setSkillsLoading(true);
    setSkillsError(null);
    try {
      const includeGlobalArg = includeGlobal() ? "" : " --include-global false";
      const res = await client.session.command({
        path: { id: sessionId },
        body: { command: "list_skills", arguments: `--format json${includeGlobalArg}` },
      });
      const text = extractText(res.data?.parts as TextPart[] | undefined);
      const parsed = text ? JSON.parse(text) : [];
      const next = normalizeSkills(parsed);
      setSkills(next);
      setLastRefresh(Date.now());
      if (!next.find((skill) => skill.name === selectedSkillName())) {
        setSelectedSkillName(next[0]?.name ?? null);
      }
    } catch (err) {
      setSkills([]);
      setSkillsError(err instanceof Error ? err.message : "Failed to load skills.");
    } finally {
      setSkillsLoading(false);
    }
  };

  createEffect(() => {
    const sessionId = selectedSessionId();
    includeGlobal();
    if (!sessionId) return;
    void loadSkills();
  });

  return (
    <div class="flex-1 flex flex-col overflow-hidden">
      <header class="px-6 py-5 border-b border-border">
        <h1 class="text-2xl font-semibold text-foreground">Skills</h1>
        <p class="text-sm text-muted-foreground">
          Inspect OpenCode skills, their sources, and runtime load activity from the orchestrator stream.
        </p>
      </header>

      <div class="agents-shell">
        <aside class="skills-sidebar">
          <div class="skills-sidebar-inner">
            <div class="skills-header">
              <div>
                <p class="skills-eyebrow">OpenCode</p>
                <div class="flex items-center gap-2">
                  <h2 class="skills-title">Skills</h2>
                  <span class="skills-count">{skills().length}</span>
                </div>
                <p class="skills-subtitle">Discovery + runtime load telemetry</p>
              </div>
              <Button
                variant="secondary"
                size="sm"
                class="skills-new-btn"
                onClick={loadSkills}
                disabled={skillsLoading()}
              >
                {skillsLoading() ? "Refreshing..." : "Refresh"}
              </Button>
            </div>

            <div class="skills-search space-y-3">
              <Input
                placeholder="Search skills..."
                value={search()}
                onInput={(e) => setSearch(e.currentTarget.value)}
              />

              <label class="flex flex-col gap-2 text-xs text-muted-foreground">
                <span class="font-medium text-foreground">Session</span>
                <select
                  class="input"
                  value={selectedSessionId() ?? ""}
                  onChange={(e) => setSelectedSessionId(e.currentTarget.value)}
                >
                  <For
                    each={sessions()}
                    fallback={
                      <option value="" disabled>
                        No sessions available
                      </option>
                    }
                  >
                    {(session) => <option value={session.id}>{session.title || session.id.slice(0, 8)}</option>}
                  </For>
                </select>
              </label>

              <label class="flex items-center gap-2 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  checked={includeGlobal()}
                  onChange={() => setIncludeGlobal(!includeGlobal())}
                />
                Include global skill roots
              </label>

              <Show when={lastRefresh()}>
                {(at) => <div class="text-[10px] text-muted-foreground">Last refresh {formatRelativeTime(at())}</div>}
              </Show>
              <Show when={skillsError()}>
                {(err) => <div class="text-[11px] text-destructive">{err()}</div>}
              </Show>
            </div>

            <ScrollArea class="skills-list">
              <div class="skills-list-inner">
                <Show when={!skillsLoading()} fallback={<div class="skills-muted">Loading skills...</div>}>
                  <Show when={filteredSkills().length > 0} fallback={<div class="skills-muted">No skills found</div>}>
                    <For each={filteredSkills()}>
                      {(skill) => {
                        const status = getStatusBadge(skill);
                        const lastLoad = lastLoadBySkill().get(skill.name);
                        return (
                          <button
                            class={
                              selectedSkillName() === skill.name
                                ? "skill-item selected"
                                : "skill-item"
                            }
                            onClick={() => setSelectedSkillName(skill.name)}
                          >
                            <div class="skill-item-header">
                              <div class="skill-item-title">{skill.name}</div>
                              <Badge variant={status.variant}>{status.label}</Badge>
                            </div>
                            <div class="skill-item-desc">{skill.description || "No description provided."}</div>
                            <div class="skill-item-meta">
                              <span>{formatSkillSource(skill.source)}</span>
                              <span class="skill-item-dot" />
                              <span>{skill.permission ?? "allow"}</span>
                              <Show when={lastLoad}>
                                {(load) => (
                                  <>
                                    <span class="skill-item-dot" />
                                    <span>Last seen {formatRelativeTime(load().timestamp)}</span>
                                  </>
                                )}
                              </Show>
                            </div>
                          </button>
                        );
                      }}
                    </For>
                  </Show>
                </Show>
              </div>
            </ScrollArea>
          </div>
        </aside>

        <div class="skills-workspace">
          <Show
            when={selectedSkill()}
            fallback={
              <div class="skills-empty">
                <div class="skills-empty-card">
                  <div class="skills-empty-icon">◎</div>
                  <div>
                    <h3 class="skills-empty-title">Select a skill</h3>
                    <p class="skills-empty-subtitle">Pick a skill on the left to inspect source and usage.</p>
                  </div>
                </div>
              </div>
            }
          >
            {(skill) => {
              const status = getStatusBadge(skill());
              const lastLoad = lastLoadBySkill().get(skill().name);
              const worker = lastLoad?.workerId ? workerById().get(lastLoad.workerId) : undefined;
              return (
                <div class="skills-editor">
                  <div class="skills-editor-header">
                    <div>
                      <p class="skills-editor-eyebrow">OpenCode Skill</p>
                      <h2 class="skills-editor-title">{skill().name}</h2>
                      <p class="skills-editor-subtitle">{skill().description || "No description provided."}</p>
                    </div>
                    <div class="skills-editor-actions">
                      <Badge variant={status.variant}>{status.label}</Badge>
                    </div>
                  </div>

                  <div class="skills-editor-body space-y-6">
                    <div class="grid gap-4 md:grid-cols-2">
                      <Card>
                        <CardHeader>
                          <CardTitle class="text-sm text-muted-foreground">Source</CardTitle>
                        </CardHeader>
                        <CardContent class="space-y-2 text-sm">
                          <div class="font-medium text-foreground">{formatSkillSource(skill().source)}</div>
                          <Show when={skill().path}>
                            {(path) => <div class="text-xs text-muted-foreground font-mono break-all">{path()}</div>}
                          </Show>
                        </CardContent>
                      </Card>

                      <Card>
                        <CardHeader>
                          <CardTitle class="text-sm text-muted-foreground">Permission</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div class="flex items-center gap-2">
                            <Badge variant="outline">{skill().permission ?? "allow"}</Badge>
                            <span class="text-xs text-muted-foreground">skill permission pattern</span>
                          </div>
                        </CardContent>
                      </Card>
                    </div>

                    <Card>
                      <CardHeader>
                        <CardTitle>Last Loaded</CardTitle>
                        <CardDescription>Latest skill load event from the orchestrator stream.</CardDescription>
                      </CardHeader>
                      <CardContent>
                        <Show
                          when={lastLoad}
                          fallback={<div class="text-sm text-muted-foreground">No load events captured yet.</div>}
                        >
                          {(load) => (
                            <div class="space-y-2 text-sm">
                              <div class="flex items-center gap-2">
                                <Badge
                                  variant={
                                    load().status === "error" ? "error" : load().status === "success" ? "ready" : "secondary"
                                  }
                                >
                                  {load().status === "error"
                                    ? "Failed"
                                    : load().status === "success"
                                      ? "Loaded"
                                      : "Loading"}
                                </Badge>
                                <span class="text-muted-foreground">{formatRelativeTime(load().timestamp)}</span>
                              </div>
                              <div class="text-xs text-muted-foreground">
                                Worker: {worker?.name ?? load().workerId ?? "unknown"}
                              </div>
                              <Show when={load().workerKind}>
                                <div class="text-xs text-muted-foreground">
                                  Worker Kind: {load().workerKind}
                                </div>
                              </Show>
                              <div class="text-xs text-muted-foreground">
                                Session: {load().sessionId ?? "unknown"}
                              </div>
                              <Show when={load().callId}>
                                <div class="text-xs text-muted-foreground font-mono">
                                  Call ID: {load().callId}
                                </div>
                              </Show>
                              <Show when={load().workflowRunId || load().workflowStepId}>
                                <div class="text-xs text-muted-foreground">
                                  Workflow: {load().workflowRunId ?? "run"}
                                  {load().workflowStepId ? ` · Step ${load().workflowStepId}` : ""}
                                </div>
                              </Show>
                              <Show when={load().durationMs != null}>
                                <div class="text-xs text-muted-foreground">
                                  Duration: {(load().durationMs! / 1000).toFixed(2)}s
                                </div>
                              </Show>
                              <Show when={load().outputBytes != null}>
                                <div class="text-xs text-muted-foreground">
                                  Output: {load().outputBytes! > 1024 ? `${(load().outputBytes! / 1024).toFixed(1)}KB` : `${load().outputBytes}B`}
                                </div>
                              </Show>
                            </div>
                          )}
                        </Show>
                      </CardContent>
                    </Card>

                    <Show when={(skill().errors ?? []).length > 0}>
                      <Card>
                        <CardHeader>
                          <CardTitle>Validation Issues</CardTitle>
                          <CardDescription>Problems detected while parsing the skill frontmatter.</CardDescription>
                        </CardHeader>
                        <CardContent class="space-y-2 text-sm">
                          <For each={skill().errors ?? []}>{(err) => <div>• {err}</div>}</For>
                        </CardContent>
                      </Card>
                    </Show>
                  </div>
                </div>
              );
            }}
          </Show>
        </div>
      </div>
    </div>
  );
};

export { SkillsPage as SkillsWorkspace };
