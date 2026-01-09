/**
 * Profiles Page - View orchestrator profiles (model + capability combinations)
 *
 * Profiles define worker configurations:
 * - Model to use
 * - Purpose/description
 * - Tool permissions
 * - Special capabilities (vision, web)
 *
 * Data sources:
 * 1. Live workers from orchestrator (primary) - includes runtime status
 * 2. Profile definitions from config (secondary)
 */

import { type Component, createMemo, createSignal, For, Show } from "solid-js";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { type WorkerRuntime, useOpenCode } from "@/context/opencode";
import { ORCHESTRATOR_PROFILES } from "@/lib/orchestrator-config";

type Profile = {
  id: string;
  name: string;
  model?: string;
  purpose?: string;
  whenToUse?: string;
  status: "configured" | WorkerRuntime["status"];
  isActive: boolean;
  supportsVision?: boolean;
  supportsWeb?: boolean;
  worker?: WorkerRuntime;
  // Fields from WorkerRuntime (when active)
  sessionId?: string;
  serverUrl?: string;
  port?: number;
  currentTask?: string;
  lastActivity?: string;
  lastResult?: WorkerRuntime["lastResult"];
  error?: string;
  warning?: string;
};

export const ProfilesPage: Component = () => {
  const { workers, connected } = useOpenCode();
  const [search, setSearch] = createSignal("");
  const [selectedProfileId, setSelectedProfileId] = createSignal<string | null>(null);

  // Merge configured profiles with active workers
  const profiles = createMemo((): Profile[] => {
    const workerList = workers();
    const workerById = new Map<string, WorkerRuntime>();
    for (const w of workerList) {
      if (!workerById.has(w.id)) {
        workerById.set(w.id, w);
      }
    }

    // Create profile list: configured profiles + active status
    return ORCHESTRATOR_PROFILES.map((config) => {
      const worker = workerById.get(config.id);
      return {
        id: config.id,
        name: config.name,
        model: worker?.model || config.model,
        purpose: config.purpose,
        whenToUse: config.whenToUse,
        status: worker ? worker.status : "configured",
        isActive: !!worker,
        supportsVision: config.supportsVision,
        supportsWeb: config.supportsWeb,
        worker,
        // Copy worker fields for easy access
        sessionId: worker?.sessionId,
        serverUrl: worker?.serverUrl,
        port: worker?.port,
        currentTask: worker?.currentTask,
        lastActivity: worker?.lastActivity,
        lastResult: worker?.lastResult,
        error: worker?.error,
        warning: worker?.warning,
      };
    });
  });

  const filteredProfiles = createMemo(() => {
    const q = search().trim().toLowerCase();
    const list = profiles();
    if (!q) return list;
    return list.filter((p) => {
      const haystack = [p.id, p.name ?? "", p.model ?? "", p.currentTask ?? ""]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  });

  const selectedProfile = createMemo(() => {
    const id = selectedProfileId();
    if (!id) return undefined;
    return profiles().find((p) => p.id === id);
  });

  // Auto-select first profile
  createMemo(() => {
    if (!selectedProfileId() && filteredProfiles().length > 0) {
      setSelectedProfileId(filteredProfiles()[0].id);
    }
  });

  const getStatusVariant = (status: Profile["status"]) => {
    switch (status) {
      case "ready":
        return "ready" as const;
      case "busy":
        return "busy" as const;
      case "error":
        return "error" as const;
      case "configured":
        return "outline" as const;
      default:
        return "secondary" as const;
    }
  };

  const getStatusLabel = (status: Profile["status"]) => {
    return status === "configured" ? "not active" : status;
  };

  return (
    <div class="flex-1 flex overflow-hidden">
      {/* Sidebar - Profile list */}
      <aside class="w-80 border-r border-border bg-card/30 flex flex-col">
        <div class="p-4 border-b border-border">
          <Input
            placeholder="Search profiles..."
            value={search()}
            onInput={(e) => setSearch(e.currentTarget.value)}
          />
          <div class="mt-2 text-xs text-muted-foreground">
            {profiles().length} profiles ({profiles().filter(p => p.isActive).length} active)
          </div>
        </div>

        {/* Profile list */}
        <div class="flex-1 overflow-y-auto p-2 space-y-1">
          <Show
            when={connected()}
            fallback={
              <div class="p-4 text-sm text-muted-foreground">
                <div class="text-center">
                  <div class="text-2xl mb-2">📡</div>
                  <p>Not connected to orchestrator</p>
                  <p class="text-xs mt-1">Start the server to see profiles</p>
                </div>
              </div>
            }
          >
            <Show
              when={filteredProfiles().length > 0}
              fallback={
                <div class="p-4 text-sm text-muted-foreground text-center">
                  <div class="text-2xl mb-2">🎭</div>
                  <p>No profiles found</p>
                  <p class="text-xs mt-1">
                    Profiles are created when workers start
                  </p>
                </div>
              }
            >
              <For each={filteredProfiles()}>
                {(profile) => (
                  <button
                    type="button"
                    class="w-full text-left rounded-md px-3 py-2.5 transition-colors"
                    classList={{
                      "bg-accent": selectedProfileId() === profile.id,
                      "hover:bg-accent/50": selectedProfileId() !== profile.id,
                    }}
                    onClick={() => setSelectedProfileId(profile.id)}
                  >
                    <div class="flex items-center justify-between mb-1">
                      <span class="font-medium text-foreground text-sm">
                        {profile.name || profile.id}
                      </span>
                      <Badge variant={getStatusVariant(profile.status)}>
                        {getStatusLabel(profile.status)}
                      </Badge>
                    </div>
                    <Show when={profile.model}>
                      <div class="text-xs text-muted-foreground mb-1 font-mono truncate">
                        {profile.model}
                      </div>
                    </Show>
                    <div class="flex items-center gap-1.5 mt-1.5">
                      <Show when={profile.supportsVision}>
                        <span class="text-[10px] px-1.5 py-0.5 bg-muted rounded">
                          Vision
                        </span>
                      </Show>
                      <Show when={profile.supportsWeb}>
                        <span class="text-[10px] px-1.5 py-0.5 bg-muted rounded">
                          Web
                        </span>
                      </Show>
                    </div>
                  </button>
                )}
              </For>
            </Show>
          </Show>
        </div>
      </aside>

      {/* Main content - Profile details */}
      <div class="flex-1 overflow-auto">
        <Show
          when={selectedProfile()}
          fallback={
            <div class="h-full flex items-center justify-center">
              <div class="text-center">
                <div class="text-4xl mb-4">🎭</div>
                <h3 class="text-lg font-medium text-foreground mb-1">
                  Select a Profile
                </h3>
                <p class="text-sm text-muted-foreground">
                  Choose a profile from the list to view its configuration.
                </p>
              </div>
            </div>
          }
        >
          {(profile) => (
            <div class="p-6 space-y-6">
              {/* Header */}
              <div class="flex items-start justify-between">
                <div>
                  <h2 class="text-xl font-semibold text-foreground">
                    {profile().name || profile().id}
                  </h2>
                  <p class="text-sm text-muted-foreground mt-1 font-mono">
                    ID: {profile().id}
                  </p>
                </div>
                <Badge variant={getStatusVariant(profile().status)} class="text-sm">
                  {profile().status}
                </Badge>
              </div>

              <div class="grid gap-4 md:grid-cols-2">
                {/* Model */}
                <Card>
                  <CardHeader>
                    <CardTitle class="text-sm">Model</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <code class="text-sm font-mono bg-muted px-2 py-1 rounded block break-all">
                      {profile().model ?? "default"}
                    </code>
                  </CardContent>
                </Card>

                {/* Capabilities */}
                <Card>
                  <CardHeader>
                    <CardTitle class="text-sm">Capabilities</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div class="flex flex-wrap gap-2">
                      <Show when={profile().supportsVision}>
                        <Badge variant="secondary">Vision</Badge>
                      </Show>
                      <Show when={profile().supportsWeb}>
                        <Badge variant="secondary">Web Access</Badge>
                      </Show>
                      <Show
                        when={!profile().supportsVision && !profile().supportsWeb}
                      >
                        <span class="text-sm text-muted-foreground">
                          Standard capabilities
                        </span>
                      </Show>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Current Task */}
              <Show when={profile().currentTask}>
                <Card>
                  <CardHeader>
                    <CardTitle class="text-sm">Current Task</CardTitle>
                    <CardDescription>What this worker is doing right now</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div class="p-3 bg-status-busy/10 rounded-md">
                      <p class="text-sm text-foreground line-clamp-3">
                        {profile().currentTask}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              </Show>

              {/* Session Info */}
              <Show when={profile().sessionId || profile().serverUrl}>
                <Card>
                  <CardHeader>
                    <CardTitle class="text-sm">Runtime Info</CardTitle>
                    <CardDescription>Active session and server details</CardDescription>
                  </CardHeader>
                  <CardContent class="space-y-2 text-sm">
                    <Show when={profile().sessionId}>
                      <div>
                        <span class="font-medium">Session:</span>{" "}
                        <code class="bg-muted px-1 rounded">
                          {profile().sessionId?.slice(0, 16)}...
                        </code>
                      </div>
                    </Show>
                    <Show when={profile().serverUrl}>
                      <div>
                        <span class="font-medium">Server:</span>{" "}
                        <code class="bg-muted px-1 rounded">{profile().serverUrl}</code>
                      </div>
                    </Show>
                    <Show when={profile().port}>
                      <div>
                        <span class="font-medium">Port:</span>{" "}
                        <code class="bg-muted px-1 rounded">{profile().port}</code>
                      </div>
                    </Show>
                  </CardContent>
                </Card>
              </Show>

              {/* Last Result */}
              <Show when={profile().lastResult}>
                {(result) => (
                  <Card>
                    <CardHeader>
                      <CardTitle class="text-sm">Last Result</CardTitle>
                      <CardDescription>
                        Output from the most recent task
                        <Show when={result().durationMs}>
                          {" "}
                          ({(result().durationMs! / 1000).toFixed(1)}s)
                        </Show>
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <Show when={result().response}>
                        <pre class="text-xs bg-muted p-3 rounded overflow-x-auto max-h-48 whitespace-pre-wrap">
                          {result().response?.slice(0, 2000)}
                          {(result().response?.length ?? 0) > 2000 && "..."}
                        </pre>
                      </Show>
                      <Show when={result().at}>
                        <div class="text-xs text-muted-foreground mt-2">
                          Completed: {new Date(result().at!).toLocaleString()}
                        </div>
                      </Show>
                    </CardContent>
                  </Card>
                )}
              </Show>

              {/* Error */}
              <Show when={profile().error}>
                <Card class="border-status-error/50">
                  <CardHeader>
                    <CardTitle class="text-sm text-status-error">Error</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p class="text-sm text-status-error">{profile().error}</p>
                  </CardContent>
                </Card>
              </Show>

              {/* Warning */}
              <Show when={profile().warning}>
                <Card class="border-status-busy/50">
                  <CardHeader>
                    <CardTitle class="text-sm text-status-busy">Warning</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p class="text-sm text-status-busy">{profile().warning}</p>
                  </CardContent>
                </Card>
              </Show>

              {/* Last Activity */}
              <Show when={profile().lastActivity}>
                <div class="text-xs text-muted-foreground">
                  Last activity: {new Date(profile().lastActivity!).toLocaleString()}
                </div>
              </Show>
            </div>
          )}
        </Show>
      </div>
    </div>
  );
};
