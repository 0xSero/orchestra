/**
 * Settings Page - Core configuration and preferences
 */

import { type Component } from "solid-js";
import { useDb } from "@/context/db";
import { SettingsPreferencesCard } from "./settings-preferences-card";
import { SettingsConnectionsCard } from "./settings-connections-card";
import { SettingsSqliteCard } from "./settings-sqlite-card";

/** Settings page for configuration and preferences. */
export const SettingsPage: Component = () => {
  const { dbPath, user, preferences, setPreference, deletePreference, markOnboarded } = useDb();

  return (
    <div class="flex-1 flex flex-col overflow-hidden">
      <header class="px-6 py-5 border-b border-border">
        <h1 class="text-2xl font-semibold text-foreground">Settings</h1>
        <p class="text-sm text-muted-foreground">Configuration and preferences</p>
      </header>

      <div class="flex-1 overflow-auto p-6">
        <div class="max-w-4xl space-y-6">
          <SettingsConnectionsCard />
          <SettingsPreferencesCard preferences={preferences()} onSave={setPreference} onDelete={deletePreference} />
          <SettingsSqliteCard dbPath={dbPath()} user={user()} onMarkOnboarded={markOnboarded} />
        </div>
      </div>
    </div>
  );
};
