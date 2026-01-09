/**
 * Dashboard - Live overview with dense, table-based layout
 * Shows ALL available data: workers, jobs, events, workflows, skills
 */

import { type Component, createMemo, For, Show } from "solid-js";
import { useOpenCode } from "@/context/opencode";
import { formatRelativeTime, formatDuration } from "@/lib/utils";
import { ORCHESTRATOR_PROFILES, ORCHESTRATOR_WORKFLOWS } from "@/lib/orchestrator-config";

const getStatusColor = (status: string) => {
  switch (status) {
    case "ready":
    case "succeeded":
    case "success":
      return "text-status-ready";
    case "busy":
    case "running":
      return "text-status-busy";
    case "error":
    case "failed":
      return "text-status-error";
    default:
      return "text-muted-foreground";
  }
};

export const DashboardPage: Component = () => {
  const { workers, jobs, jobSummary, workflowRuns, skillEvents, events } = useOpenCode();

  const activeWorkers = createMemo(() => workers().filter(w => w.status !== "stopped"));
  const recentJobs = createMemo(() => jobs().slice().sort((a, b) => b.startedAt - a.startedAt).slice(0, 10));
  const activeWorkflows = createMemo(() => Object.values(workflowRuns()).filter(w => w.status === "running"));
  const recentSkills = createMemo(() => skillEvents().slice().sort((a, b) => b.timestamp - a.timestamp).slice(0, 10));
  const recentEvents = createMemo(() => events().slice(0, 20));

  // Profile status: how many of each profile are active
  const profileStatus = createMemo(() => {
    const workerIds = new Set(workers().map(w => w.id));
    return ORCHESTRATOR_PROFILES.map(p => ({
      ...p,
      isActive: workerIds.has(p.id),
    }));
  });

  return (
    <div class="h-full overflow-auto">
      <div class="p-6 space-y-6">
        {/* Header */}
        <header>
          <h1 class="text-2xl font-semibold text-foreground">Dashboard</h1>
          <p class="text-sm text-muted-foreground">Live system overview</p>
        </header>

        {/* Quick Stats Bar */}
        <div class="flex items-center gap-6 text-sm">
          <div>
            <span class="text-muted-foreground">Workers:</span>{" "}
            <span class="font-semibold text-foreground">{activeWorkers().length}</span>
            <span class="text-muted-foreground">/{ORCHESTRATOR_PROFILES.length}</span>
          </div>
          <div>
            <span class="text-muted-foreground">Jobs:</span>{" "}
            <span class="font-semibold text-status-busy">{jobSummary()?.running ?? 0}</span>{" "}
            <span class="text-muted-foreground">running</span>
          </div>
          <div>
            <span class="text-muted-foreground">Workflows:</span>{" "}
            <span class="font-semibold text-status-busy">{activeWorkflows().length}</span>{" "}
            <span class="text-muted-foreground">active</span>
          </div>
          <div>
            <span class="text-muted-foreground">Events:</span>{" "}
            <span class="font-semibold text-foreground">{events().length}</span>
          </div>
        </div>

        {/* Workers Table */}
        <section>
          <h2 class="text-sm font-semibold text-foreground mb-3">Workers</h2>
          <div class="border border-border rounded-md overflow-hidden">
            <table class="w-full text-sm">
              <thead class="bg-muted/50 text-xs text-muted-foreground">
                <tr>
                  <th class="text-left px-3 py-2 font-medium">Profile</th>
                  <th class="text-left px-3 py-2 font-medium">Model</th>
                  <th class="text-left px-3 py-2 font-medium">Status</th>
                  <th class="text-left px-3 py-2 font-medium">Current Task</th>
                  <th class="text-left px-3 py-2 font-medium">Last Activity</th>
                </tr>
              </thead>
              <tbody class="text-xs">
                <For each={profileStatus()} fallback={<tr><td colspan="5" class="text-center py-4 text-muted-foreground">No profiles configured</td></tr>}>
                  {(profile) => {
                    const worker = workers().find(w => w.id === profile.id);
                    return (
                      <tr class="border-t border-border hover:bg-muted/20">
                        <td class="px-3 py-2">
                          <div class="font-medium text-foreground">{profile.name}</div>
                          <div class="text-muted-foreground">{profile.id}</div>
                        </td>
                        <td class="px-3 py-2 font-mono text-muted-foreground">{worker?.model || profile.model}</td>
                        <td class="px-3 py-2">
                          <Show when={worker} fallback={<span class="text-muted-foreground">inactive</span>}>
                            <span class={getStatusColor(worker!.status)}>{worker!.status}</span>
                          </Show>
                        </td>
                        <td class="px-3 py-2 text-muted-foreground max-w-md truncate">
                          {worker?.currentTask || "—"}
                        </td>
                        <td class="px-3 py-2 text-muted-foreground">
                          {worker?.lastActivity ? formatRelativeTime(new Date(worker.lastActivity).getTime()) : "—"}
                        </td>
                      </tr>
                    );
                  }}
                </For>
              </tbody>
            </table>
          </div>
        </section>

        {/* Jobs Table */}
        <section>
          <h2 class="text-sm font-semibold text-foreground mb-3">Recent Jobs</h2>
          <div class="border border-border rounded-md overflow-hidden">
            <table class="w-full text-sm">
              <thead class="bg-muted/50 text-xs text-muted-foreground">
                <tr>
                  <th class="text-left px-3 py-2 font-medium">Worker</th>
                  <th class="text-left px-3 py-2 font-medium">Task</th>
                  <th class="text-left px-3 py-2 font-medium">Status</th>
                  <th class="text-left px-3 py-2 font-medium">Duration</th>
                  <th class="text-left px-3 py-2 font-medium">Started</th>
                </tr>
              </thead>
              <tbody class="text-xs">
                <For each={recentJobs()} fallback={<tr><td colspan="5" class="text-center py-4 text-muted-foreground">No jobs yet</td></tr>}>
                  {(job) => (
                    <tr class="border-t border-border hover:bg-muted/20">
                      <td class="px-3 py-2 font-medium text-foreground">{job.workerId}</td>
                      <td class="px-3 py-2 text-muted-foreground max-w-sm truncate">{job.message}</td>
                      <td class="px-3 py-2">
                        <span class={getStatusColor(job.status)}>{job.status}</span>
                      </td>
                      <td class="px-3 py-2 text-muted-foreground">
                        {job.durationMs ? formatDuration(job.durationMs) : job.status === "running" ? "⏱️" : "—"}
                      </td>
                      <td class="px-3 py-2 text-muted-foreground">{formatRelativeTime(job.startedAt)}</td>
                    </tr>
                  )}
                </For>
              </tbody>
            </table>
          </div>
        </section>

        {/* Workflows Table */}
        <section>
          <h2 class="text-sm font-semibold text-foreground mb-3">Workflows</h2>
          <div class="border border-border rounded-md overflow-hidden">
            <table class="w-full text-sm">
              <thead class="bg-muted/50 text-xs text-muted-foreground">
                <tr>
                  <th class="text-left px-3 py-2 font-medium">Workflow</th>
                  <th class="text-left px-3 py-2 font-medium">Description</th>
                  <th class="text-left px-3 py-2 font-medium">Status</th>
                  <th class="text-left px-3 py-2 font-medium">Last Run</th>
                </tr>
              </thead>
              <tbody class="text-xs">
                <For each={ORCHESTRATOR_WORKFLOWS}>
                  {(workflow) => {
                    const runs = Object.values(workflowRuns()).filter(r => r.workflowId === workflow.id);
                    const lastRun = runs.sort((a, b) => b.startedAt - a.startedAt)[0];
                    return (
                      <tr class="border-t border-border hover:bg-muted/20">
                        <td class="px-3 py-2 font-medium text-foreground">{workflow.name}</td>
                        <td class="px-3 py-2 text-muted-foreground">{workflow.description || "—"}</td>
                        <td class="px-3 py-2">
                          <Show when={workflow.enabled} fallback={<span class="text-muted-foreground">disabled</span>}>
                            <Show when={lastRun} fallback={<span class="text-muted-foreground">not started</span>}>
                              <span class={getStatusColor(lastRun!.status)}>{lastRun!.status}</span>
                            </Show>
                          </Show>
                        </td>
                        <td class="px-3 py-2 text-muted-foreground">
                          {lastRun ? formatRelativeTime(lastRun.startedAt) : "—"}
                        </td>
                      </tr>
                    );
                  }}
                </For>
              </tbody>
            </table>
          </div>
        </section>

        {/* Recent Skills */}
        <section>
          <h2 class="text-sm font-semibold text-foreground mb-3">Recent Skill Loads</h2>
          <div class="border border-border rounded-md overflow-hidden">
            <table class="w-full text-sm">
              <thead class="bg-muted/50 text-xs text-muted-foreground">
                <tr>
                  <th class="text-left px-3 py-2 font-medium">Skill</th>
                  <th class="text-left px-3 py-2 font-medium">Worker</th>
                  <th class="text-left px-3 py-2 font-medium">Status</th>
                  <th class="text-left px-3 py-2 font-medium">Duration</th>
                  <th class="text-left px-3 py-2 font-medium">Time</th>
                </tr>
              </thead>
              <tbody class="text-xs">
                <For each={recentSkills()} fallback={<tr><td colspan="5" class="text-center py-4 text-muted-foreground">No skill loads yet</td></tr>}>
                  {(skill) => (
                    <tr class="border-t border-border hover:bg-muted/20">
                      <td class="px-3 py-2 font-medium text-foreground">{skill.skillName || "—"}</td>
                      <td class="px-3 py-2 text-muted-foreground">{skill.workerId || "—"}</td>
                      <td class="px-3 py-2">
                        <span class={skill.status === "success" ? "text-status-ready" : "text-status-error"}>
                          {skill.status || "—"}
                        </span>
                      </td>
                      <td class="px-3 py-2 text-muted-foreground">
                        {skill.durationMs ? formatDuration(skill.durationMs) : "—"}
                      </td>
                      <td class="px-3 py-2 text-muted-foreground">{formatRelativeTime(skill.timestamp)}</td>
                    </tr>
                  )}
                </For>
              </tbody>
            </table>
          </div>
        </section>

        {/* Recent Events */}
        <section>
          <h2 class="text-sm font-semibold text-foreground mb-3">Recent Events</h2>
          <div class="border border-border rounded-md overflow-hidden">
            <table class="w-full text-sm">
              <thead class="bg-muted/50 text-xs text-muted-foreground">
                <tr>
                  <th class="text-left px-3 py-2 font-medium">Type</th>
                  <th class="text-left px-3 py-2 font-medium">Time</th>
                </tr>
              </thead>
              <tbody class="text-xs">
                <For each={recentEvents()} fallback={<tr><td colspan="2" class="text-center py-4 text-muted-foreground">No events yet</td></tr>}>
                  {(event) => (
                    <tr class="border-t border-border hover:bg-muted/20">
                      <td class="px-3 py-2 font-mono text-foreground">{event.type}</td>
                      <td class="px-3 py-2 text-muted-foreground">{formatRelativeTime(event.at)}</td>
                    </tr>
                  )}
                </For>
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
};
