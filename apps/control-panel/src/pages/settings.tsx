/**
 * Settings Page - SQLite-backed preferences + worker overrides
 */

import { type Component, createEffect, createMemo, createSignal } from "solid-js";
import { useDb } from "@/context/db";
import { useAgents } from "@/context/agents";
import { SettingsOverridesCard } from "./settings-overrides-card";
import { SettingsPreferencesCard } from "./settings-preferences-card";
import { SettingsConnectionsCard } from "./settings-connections-card";
import { SettingsSidebar } from "./settings-sidebar";
import { SettingsSqliteCard } from "./settings-sqlite-card";
import { SettingsConfigCard } from "./settings-config-card";

/** Settings page for preferences and worker overrides. */
export const SettingsPage: Component = () => {
  const { agents } = useAgents();
  const {
    dbPath,
    user,
    preferences,
    workerConfigs,
    setPreference,
    deletePreference,
    setWorkerConfig,
    clearWorkerConfig,
    markOnboarded,
  } = useDb();

  const [selectedWorkerId, setSelectedWorkerId] = createSignal<string | null>(null);

  const sortedAgents = createMemo(() =>
    agents()
      .slice()
      .sort((a, b) => a.id.localeCompare(b.id)),
  );

  createEffect(() => {
    if (!selectedWorkerId() && sortedAgents().length > 0) {
      setSelectedWorkerId(sortedAgents()[0].id);
    }
  });

  const selectedAgent = createMemo(() =>
    selectedWorkerId() ? sortedAgents().find((agent) => agent.id === selectedWorkerId()) : undefined,
  );

  const selectedConfig = createMemo(() =>
    selectedWorkerId() ? workerConfigs().find((config) => config.workerId === selectedWorkerId()) : undefined,
  );

  return (
    <div class="flex-1 flex flex-col overflow-hidden">
      <header class="px-6 py-5 border-b border-border">
        <h1 class="text-2xl font-semibold text-foreground">Settings</h1>
        <p class="text-sm text-muted-foreground">Preferences, overrides, and onboarding controls.</p>
      </header>

      <div class="flex-1 flex overflow-hidden">
        <SettingsSidebar
          agents={sortedAgents()}
          selectedWorkerId={selectedWorkerId()}
          onSelectWorker={setSelectedWorkerId}
        />

        <div class="flex-1 overflow-auto p-6">
          <div class="max-w-4xl space-y-6 animate-fade-in">
            <SettingsSqliteCard dbPath={dbPath()} user={user()} onMarkOnboarded={markOnboarded} />
            <SettingsConnectionsCard />
            <SettingsConfigCard />
            <SettingsPreferencesCard preferences={preferences()} onSave={setPreference} onDelete={deletePreference} />
            <SettingsOverridesCard
              agent={selectedAgent()}
              config={selectedConfig()}
              onSave={setWorkerConfig}
              onReset={clearWorkerConfig}
            />
          </div>
        </div>
      </div>
    </div>
  );
};
