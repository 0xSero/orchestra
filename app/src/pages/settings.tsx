/**
 * Settings Page - SQLite-backed preferences + worker overrides
 */

import { type Component, createEffect, createMemo, createSignal } from "solid-js";
import { useDb } from "@/context/db";
import { useSkills } from "@/context/skills";
import { SettingsOverridesCard } from "./settings-overrides-card";
import { SettingsPreferencesCard } from "./settings-preferences-card";
import { SettingsSidebar } from "./settings-sidebar";
import { SettingsSqliteCard } from "./settings-sqlite-card";

/** Settings page for preferences and worker overrides. */
export const SettingsPage: Component = () => {
  const { skills } = useSkills();
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

  const sortedSkills = createMemo(() =>
    skills()
      .slice()
      .sort((a, b) => a.id.localeCompare(b.id)),
  );

  createEffect(() => {
    if (!selectedWorkerId() && sortedSkills().length > 0) {
      setSelectedWorkerId(sortedSkills()[0].id);
    }
  });

  const selectedSkill = createMemo(() =>
    selectedWorkerId() ? sortedSkills().find((skill) => skill.id === selectedWorkerId()) : undefined,
  );

  const selectedConfig = createMemo(() =>
    selectedWorkerId() ? workerConfigs().find((config) => config.workerId === selectedWorkerId()) : undefined,
  );

  return (
    <div class="flex-1 flex overflow-hidden">
      <SettingsSidebar
        skills={sortedSkills()}
        selectedWorkerId={selectedWorkerId()}
        onSelectWorker={setSelectedWorkerId}
      />

      <div class="flex-1 overflow-auto p-6">
        <div class="max-w-4xl space-y-6 animate-fade-in">
          <SettingsSqliteCard dbPath={dbPath()} user={user()} onMarkOnboarded={markOnboarded} />
          <SettingsPreferencesCard preferences={preferences()} onSave={setPreference} onDelete={deletePreference} />
          <SettingsOverridesCard
            skill={selectedSkill()}
            config={selectedConfig()}
            onSave={setWorkerConfig}
            onReset={clearWorkerConfig}
          />
        </div>
      </div>
    </div>
  );
};
