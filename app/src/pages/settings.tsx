/**
 * Settings Page - SQLite-backed preferences + worker overrides
 */

import { type Component, createEffect, createMemo, createSignal, For, Show } from "solid-js";
import { TemperatureSlider } from "@/components/skills/fields/temperature-slider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useDb } from "@/context/db";
import { useSkills } from "@/context/skills";

type PreferenceRowProps = {
  name: string;
  value: string | null;
  onSave: (key: string, value: string | null) => void;
  onDelete: (key: string) => void;
};

const PreferenceRow: Component<PreferenceRowProps> = (props) => {
  const [localValue, setLocalValue] = createSignal(props.value ?? "");

  createEffect(() => {
    setLocalValue(props.value ?? "");
  });

  const handleSave = () => {
    props.onSave(props.name, localValue().trim() ? localValue() : null);
  };

  return (
    <div class="flex items-center gap-2">
      <div class="w-40 text-xs font-medium text-foreground">{props.name}</div>
      <Input value={localValue()} onInput={(e) => setLocalValue(e.currentTarget.value)} class="flex-1" />
      <Button variant="outline" size="sm" onClick={handleSave}>
        Save
      </Button>
      <Button variant="ghost" size="sm" onClick={() => props.onDelete(props.name)}>
        Remove
      </Button>
    </div>
  );
};

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
    selectedWorkerId() ? sortedSkills().find((s) => s.id === selectedWorkerId()) : undefined,
  );

  const selectedConfig = createMemo(() =>
    selectedWorkerId() ? workerConfigs().find((c) => c.workerId === selectedWorkerId()) : undefined,
  );

  const [modelOverride, setModelOverride] = createSignal("");
  const [temperatureEnabled, setTemperatureEnabled] = createSignal(false);
  const [temperatureValue, setTemperatureValue] = createSignal(0.7);
  const [maxTokensEnabled, setMaxTokensEnabled] = createSignal(false);
  const [maxTokensValue, setMaxTokensValue] = createSignal(2048);
  const [enabledOverride, setEnabledOverride] = createSignal(true);

  createEffect(() => {
    const config = selectedConfig();
    const skill = selectedSkill();
    setModelOverride(config?.model ?? "");
    setEnabledOverride(config?.enabled ?? true);

    const baseTemp = skill?.frontmatter.temperature ?? 0.7;
    if (config?.temperature !== null && config?.temperature !== undefined) {
      setTemperatureEnabled(true);
      setTemperatureValue(config.temperature);
    } else {
      setTemperatureEnabled(false);
      setTemperatureValue(baseTemp);
    }

    if (config?.maxTokens !== null && config?.maxTokens !== undefined) {
      setMaxTokensEnabled(true);
      setMaxTokensValue(config.maxTokens);
    } else {
      setMaxTokensEnabled(false);
      setMaxTokensValue(2048);
    }
  });

  const preferenceEntries = createMemo(() => Object.entries(preferences()).sort(([a], [b]) => a.localeCompare(b)));

  const [newPrefKey, setNewPrefKey] = createSignal("");
  const [newPrefValue, setNewPrefValue] = createSignal("");

  const handleAddPreference = async () => {
    const key = newPrefKey().trim();
    if (!key) return;
    await setPreference(key, newPrefValue().trim() || null);
    setNewPrefKey("");
    setNewPrefValue("");
  };

  const handleSaveOverrides = async () => {
    const workerId = selectedWorkerId();
    if (!workerId) return;
    await setWorkerConfig(workerId, {
      model: modelOverride().trim() ? modelOverride().trim() : null,
      temperature: temperatureEnabled() ? temperatureValue() : null,
      maxTokens: maxTokensEnabled() ? maxTokensValue() : null,
      enabled: enabledOverride(),
    });
  };

  const handleResetOverrides = async () => {
    const workerId = selectedWorkerId();
    if (!workerId) return;
    await clearWorkerConfig(workerId);
  };

  return (
    <div class="flex-1 flex overflow-hidden">
      <aside class="w-72 border-r border-border overflow-hidden flex flex-col bg-card/30">
        <div class="p-4 border-b border-border">
          <h2 class="text-sm font-semibold text-foreground mb-1">Worker Profiles</h2>
          <p class="text-xs text-muted-foreground">Select a worker to manage SQLite overrides.</p>
        </div>

        <div class="flex-1 overflow-auto scrollbar-thin">
          <For each={sortedSkills()}>
            {(skill) => (
              <button
                class={`session-item w-full text-left ${selectedWorkerId() === skill.id ? "selected" : ""}`}
                onClick={() => setSelectedWorkerId(skill.id)}
              >
                <div class="session-item-header">
                  <div class="flex items-center gap-2 min-w-0 flex-1">
                    <span class="session-item-title">{skill.frontmatter.name ?? skill.id}</span>
                  </div>
                </div>
                <div class="session-item-meta mt-1">
                  <span class="truncate">{skill.frontmatter.model}</span>
                </div>
              </button>
            )}
          </For>

          <Show when={sortedSkills().length === 0}>
            <div class="empty-state py-12">
              <p class="empty-state-title">No skills loaded</p>
              <p class="empty-state-description">Add skills to manage overrides.</p>
            </div>
          </Show>
        </div>
      </aside>

      <div class="flex-1 overflow-auto p-6">
        <div class="max-w-4xl space-y-6 animate-fade-in">
          <Card>
            <CardHeader>
              <CardTitle>SQLite Status</CardTitle>
              <CardDescription>Local user data stored per project.</CardDescription>
            </CardHeader>
            <CardContent>
              <div class="grid gap-4 md:grid-cols-2">
                <div>
                  <div class="text-xs text-muted-foreground mb-1">Database Path</div>
                  <div class="text-sm font-mono text-foreground break-all">{dbPath() || "Not initialized"}</div>
                </div>
                <div>
                  <div class="text-xs text-muted-foreground mb-1">User</div>
                  <div class="text-sm text-foreground">{user()?.id ?? "Unknown"}</div>
                  <div class="text-xs text-muted-foreground mt-1">Onboarded: {user()?.onboarded ? "yes" : "no"}</div>
                  <Show when={!user()?.onboarded}>
                    <Button size="sm" class="mt-2" onClick={() => void markOnboarded()}>
                      Mark Onboarded
                    </Button>
                  </Show>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Preferences</CardTitle>
              <CardDescription>Key-value preferences persisted in SQLite.</CardDescription>
            </CardHeader>
            <CardContent>
              <div class="space-y-3">
                <Show when={preferenceEntries().length > 0}>
                  <For each={preferenceEntries()}>
                    {([key, value]) => (
                      <PreferenceRow
                        name={key}
                        value={value}
                        onSave={(k, v) => void setPreference(k, v)}
                        onDelete={(k) => void deletePreference(k)}
                      />
                    )}
                  </For>
                </Show>

                <div class="flex items-center gap-2 pt-2 border-t border-border">
                  <Input
                    placeholder="preference.key"
                    value={newPrefKey()}
                    onInput={(e) => setNewPrefKey(e.currentTarget.value)}
                    class="w-48"
                  />
                  <Input
                    placeholder="value"
                    value={newPrefValue()}
                    onInput={(e) => setNewPrefValue(e.currentTarget.value)}
                    class="flex-1"
                  />
                  <Button size="sm" onClick={() => void handleAddPreference()}>
                    Add
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Worker Overrides</CardTitle>
              <CardDescription>SQLite overrides apply on next spawn.</CardDescription>
            </CardHeader>
            <CardContent>
              <Show
                when={selectedSkill()}
                fallback={<div class="text-sm text-muted-foreground">Select a worker to edit overrides.</div>}
              >
                {(skill) => (
                  <div class="space-y-4">
                    <div class="grid gap-4 md:grid-cols-2">
                      <label class="flex flex-col gap-2 text-xs text-muted-foreground">
                        <span class="font-medium text-foreground">Model Override</span>
                        <Input
                          value={modelOverride()}
                          placeholder={skill().frontmatter.model ?? "auto"}
                          onInput={(e) => setModelOverride(e.currentTarget.value)}
                        />
                      </label>
                      <label class="flex items-center gap-2 text-xs text-muted-foreground">
                        <input
                          type="checkbox"
                          checked={enabledOverride()}
                          onChange={() => setEnabledOverride(!enabledOverride())}
                        />
                        Enabled
                      </label>
                    </div>

                    <div class="grid gap-4 md:grid-cols-2">
                      <div class="space-y-2">
                        <label class="flex items-center gap-2 text-xs text-muted-foreground">
                          <input
                            type="checkbox"
                            checked={temperatureEnabled()}
                            onChange={() => setTemperatureEnabled(!temperatureEnabled())}
                          />
                          Override Temperature
                        </label>
                        <div class={temperatureEnabled() ? "" : "opacity-50 pointer-events-none"}>
                          <TemperatureSlider value={temperatureValue()} onChange={setTemperatureValue} />
                        </div>
                        <div class="text-xs text-muted-foreground">
                          Default: {skill().frontmatter.temperature ?? 0.7}
                        </div>
                      </div>

                      <div class="space-y-2">
                        <label class="flex items-center gap-2 text-xs text-muted-foreground">
                          <input
                            type="checkbox"
                            checked={maxTokensEnabled()}
                            onChange={() => setMaxTokensEnabled(!maxTokensEnabled())}
                          />
                          Override Max Tokens
                        </label>
                        <Input
                          type="number"
                          min="1"
                          value={maxTokensValue()}
                          disabled={!maxTokensEnabled()}
                          onInput={(e) => {
                            const next = Number(e.currentTarget.value);
                            if (Number.isFinite(next)) setMaxTokensValue(next);
                          }}
                        />
                      </div>
                    </div>

                    <div class="flex items-center gap-2">
                      <Button size="sm" onClick={() => void handleSaveOverrides()}>
                        Save Overrides
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => void handleResetOverrides()}>
                        Reset
                      </Button>
                    </div>
                  </div>
                )}
              </Show>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};
