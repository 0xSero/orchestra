/**
 * SystemMonitor - Professional dashboard for managing OpenCode processes
 * Full-width layout with compact stats bar and data table
 */

import { type Component, createMemo, createSignal, For, onCleanup, onMount, Show } from "solid-js";
import { getSkillsApiBase } from "@/lib/opencode-base";
import { getTypeBadgeClass, getTypeLabel, PROCESS_FILTERS, type ProcessType } from "./system-monitor-utils";

type ProcessInfo = {
  pid: number;
  cpu: number;
  memory: number;
  started: string;
  command: string;
  type: ProcessType;
};

type SystemStats = {
  processes: ProcessInfo[];
  totalMemory: number;
  totalCpu: number;
  count: number;
};

export const SystemMonitor: Component = () => {
  const apiBase = getSkillsApiBase();
  const [stats, setStats] = createSignal<SystemStats | null>(null);
  const [loading, setLoading] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);
  const [killingPid, setKillingPid] = createSignal<number | null>(null);
  const [filter, setFilter] = createSignal<string>("all");

  const fetchStats = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${apiBase}/api/system/processes`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setStats(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch");
    } finally {
      setLoading(false);
    }
  };

  const killProcess = async (pid: number) => {
    setKillingPid(pid);
    try {
      const res = await fetch(`${apiBase}/api/system/processes/${pid}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await fetchStats();
    } catch (err) {
      console.error("Failed to kill process:", err);
    } finally {
      setKillingPid(null);
    }
  };

  const killAllServe = async () => {
    if (!confirm("Kill all OpenCode server processes? This will terminate all background workers.")) return;
    setLoading(true);
    try {
      const res = await fetch(`${apiBase}/api/system/processes/kill-all-serve`, {
        method: "POST",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await fetchStats();
    } catch (err) {
      console.error("Failed to kill all:", err);
    } finally {
      setLoading(false);
    }
  };

  // Auto-refresh every 5 seconds
  let interval: ReturnType<typeof setInterval>;
  onMount(() => {
    fetchStats();
    interval = setInterval(fetchStats, 5000);
  });
  onCleanup(() => clearInterval(interval));

  // Computed stats
  const serverCount = createMemo(() => stats()?.processes.filter((p) => p.type === "opencode-serve").length ?? 0);
  const serverMemory = createMemo(
    () =>
      stats()
        ?.processes.filter((p) => p.type === "opencode-serve")
        .reduce((sum, p) => sum + p.memory, 0) ?? 0,
  );

  // Filtered processes
  const filteredProcesses = createMemo(() => {
    const s = stats();
    if (!s) return [];
    const f = filter();
    if (f === "all") return s.processes;
    return s.processes.filter((p) => p.type === f);
  });

  return (
    <div class="flex-1 flex flex-col bg-background overflow-hidden">
      {/* Header bar */}
      <div class="flex-shrink-0 border-b border-border bg-card/50 px-6 py-3">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-6">
            <h1 class="text-sm font-medium text-foreground">Process Monitor</h1>

            {/* Compact stats */}
            <Show when={stats()}>
              {(s) => (
                <div class="flex items-center gap-4 text-xs">
                  <div class="flex items-center gap-1.5">
                    <span class="text-muted-foreground">Processes:</span>
                    <span class="font-medium text-foreground">{s().count}</span>
                  </div>
                  <div class="w-px h-3 bg-border" />
                  <div class="flex items-center gap-1.5">
                    <span class="text-muted-foreground">Servers:</span>
                    <span class="font-medium text-amber-600 dark:text-amber-400">{serverCount()}</span>
                  </div>
                  <div class="w-px h-3 bg-border" />
                  <div class="flex items-center gap-1.5">
                    <span class="text-muted-foreground">Memory:</span>
                    <span class="font-medium text-foreground">{(s().totalMemory / 1024).toFixed(1)} GB</span>
                  </div>
                  <div class="w-px h-3 bg-border" />
                  <div class="flex items-center gap-1.5">
                    <span class="text-muted-foreground">Server Mem:</span>
                    <span class="font-medium text-foreground">{(serverMemory() / 1024).toFixed(1)} GB</span>
                  </div>
                </div>
              )}
            </Show>
          </div>

          <div class="flex items-center gap-2">
            <button
              class="px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-accent/50 rounded transition-colors"
              onClick={fetchStats}
              disabled={loading()}
            >
              {loading() ? "..." : "Refresh"}
            </button>
            <Show when={serverCount() > 0}>
              <button
                class="px-2.5 py-1 text-xs text-destructive hover:bg-destructive/10 rounded transition-colors"
                onClick={killAllServe}
                disabled={loading()}
              >
                Kill All Servers
              </button>
            </Show>
          </div>
        </div>
      </div>

      {/* Filter tabs */}
      <div class="flex-shrink-0 border-b border-border px-6 py-2 bg-muted/30">
        <div class="flex items-center gap-1">
          {PROCESS_FILTERS.map((f) => (
            <button
              class={`px-2.5 py-1 text-xs rounded transition-colors ${
                filter() === f
                  ? "bg-accent text-foreground font-medium"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
              }`}
              onClick={() => setFilter(f)}
            >
              {f === "all" ? "All" : getTypeLabel(f)}
              <Show when={f !== "all"}>
                <span class="ml-1 opacity-60">({stats()?.processes.filter((p) => p.type === f).length ?? 0})</span>
              </Show>
            </button>
          ))}
        </div>
      </div>

      {/* Error state */}
      <Show when={error()}>
        <div class="flex-shrink-0 px-6 py-3 bg-destructive/5 border-b border-destructive/20">
          <p class="text-xs text-destructive">Connection error: Could not reach Orchestra system API at {apiBase}</p>
        </div>
      </Show>

      {/* Process table */}
      <div class="flex-1 overflow-auto">
        <table class="w-full text-xs">
          <thead class="sticky top-0 bg-muted/80 backdrop-blur-sm">
            <tr class="border-b border-border">
              <th class="text-left font-medium text-muted-foreground px-6 py-2 w-20">PID</th>
              <th class="text-left font-medium text-muted-foreground px-3 py-2 w-24">Type</th>
              <th class="text-right font-medium text-muted-foreground px-3 py-2 w-20">Memory</th>
              <th class="text-right font-medium text-muted-foreground px-3 py-2 w-16">CPU</th>
              <th class="text-left font-medium text-muted-foreground px-3 py-2 w-24">Started</th>
              <th class="text-left font-medium text-muted-foreground px-3 py-2">Command</th>
              <th class="text-right font-medium text-muted-foreground px-6 py-2 w-16"></th>
            </tr>
          </thead>
          <tbody class="divide-y divide-border/50">
            <For each={filteredProcesses()}>
              {(proc) => (
                <tr class="hover:bg-accent/30 transition-colors group">
                  <td class="px-6 py-2">
                    <span class="font-mono text-muted-foreground">{proc.pid}</span>
                  </td>
                  <td class="px-3 py-2">
                    <span
                      class={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium ${getTypeBadgeClass(proc.type)}`}
                    >
                      {getTypeLabel(proc.type)}
                    </span>
                  </td>
                  <td class="px-3 py-2 text-right">
                    <span
                      class={`font-mono ${proc.memory > 100 ? "text-amber-600 dark:text-amber-400 font-medium" : "text-foreground"}`}
                    >
                      {proc.memory.toFixed(0)} MB
                    </span>
                  </td>
                  <td class="px-3 py-2 text-right">
                    <span
                      class={`font-mono ${proc.cpu > 5 ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground"}`}
                    >
                      {proc.cpu.toFixed(1)}%
                    </span>
                  </td>
                  <td class="px-3 py-2">
                    <span class="text-muted-foreground">{proc.started}</span>
                  </td>
                  <td class="px-3 py-2">
                    <p class="text-muted-foreground truncate max-w-md" title={proc.command}>
                      {proc.command}
                    </p>
                  </td>
                  <td class="px-6 py-2 text-right">
                    <button
                      class="opacity-0 group-hover:opacity-100 px-2 py-0.5 text-destructive hover:bg-destructive/10 rounded transition-all"
                      onClick={() => killProcess(proc.pid)}
                      disabled={killingPid() === proc.pid}
                    >
                      {killingPid() === proc.pid ? "..." : "Kill"}
                    </button>
                  </td>
                </tr>
              )}
            </For>
          </tbody>
        </table>

        {/* Empty state */}
        <Show when={filteredProcesses().length === 0 && stats()}>
          <div class="flex items-center justify-center h-48 text-muted-foreground text-sm">
            No processes matching filter
          </div>
        </Show>

        {/* Loading state */}
        <Show when={loading() && !stats()}>
          <div class="flex items-center justify-center h-48 text-muted-foreground text-sm">Loading...</div>
        </Show>
      </div>

      {/* Footer status */}
      <div class="flex-shrink-0 border-t border-border px-6 py-2 bg-muted/30">
        <div class="flex items-center justify-between text-[10px] text-muted-foreground">
          <span>Auto-refresh: 5s</span>
          <span>
            Showing {filteredProcesses().length} of {stats()?.count ?? 0} processes
          </span>
        </div>
      </div>
    </div>
  );
};
