import { type Component, createEffect, createSignal, Show } from "solid-js";
import { TemperatureSlider } from "@/components/skills/fields/temperature-slider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { WorkerConfig } from "@/types/db";
import type { Skill } from "@/types/skill";

interface SettingsOverridesCardProps {
  skill?: Skill;
  config?: WorkerConfig;
  onSave: (
    workerId: string,
    overrides: { model: string | null; temperature: number | null; maxTokens: number | null; enabled: boolean },
  ) => Promise<void>;
  onReset: (workerId: string) => Promise<void>;
}

/** Card for editing per-worker override settings. */
export const SettingsOverridesCard: Component<SettingsOverridesCardProps> = (props) => {
  const [modelOverride, setModelOverride] = createSignal("");
  const [temperatureEnabled, setTemperatureEnabled] = createSignal(false);
  const [temperatureValue, setTemperatureValue] = createSignal(0.7);
  const [maxTokensEnabled, setMaxTokensEnabled] = createSignal(false);
  const [maxTokensValue, setMaxTokensValue] = createSignal(2048);
  const [enabledOverride, setEnabledOverride] = createSignal(true);

  createEffect(() => {
    const config = props.config;
    const skill = props.skill;

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

  const handleSaveOverrides = async () => {
    if (!props.skill) return;
    await props.onSave(props.skill.id, {
      model: modelOverride().trim() ? modelOverride().trim() : null,
      temperature: temperatureEnabled() ? temperatureValue() : null,
      maxTokens: maxTokensEnabled() ? maxTokensValue() : null,
      enabled: enabledOverride(),
    });
  };

  const handleResetOverrides = async () => {
    if (!props.skill) return;
    await props.onReset(props.skill.id);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Worker Overrides</CardTitle>
        <CardDescription>SQLite overrides apply on next spawn.</CardDescription>
      </CardHeader>
      <CardContent>
        <Show
          when={props.skill}
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
                    onInput={(event) => setModelOverride(event.currentTarget.value)}
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
                  <div class="text-xs text-muted-foreground">Default: {skill().frontmatter.temperature ?? 0.7}</div>
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
                    onInput={(event) => {
                      const next = Number(event.currentTarget.value);
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
  );
};
