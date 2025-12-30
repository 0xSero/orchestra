import { type Component, For, Show } from "solid-js";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { OnboardingStep } from "./onboarding-steps";

interface OnboardingStepPanelProps {
  step: OnboardingStep;
  running: "council" | "multimodal" | null;
  councilOutput: string;
  multimodalOutput: string;
  completed: boolean;
  error: string | null;
  onRunFlow: (mode: "council" | "multimodal") => void;
  onMarkComplete: () => void;
  onPrev: () => void;
  onNext: () => void;
  onSkip: () => void;
  onRestart: () => void;
  canPrev: boolean;
  canNext: boolean;
}

/** Detail panel for the currently selected onboarding step. */
export const OnboardingStepPanel: Component<OnboardingStepPanelProps> = (props) => (
  <Card>
    <CardHeader>
      <CardTitle class="text-sm">
        {props.step.title} <span class="text-xs text-muted-foreground">({props.step.estimate})</span>
      </CardTitle>
      <CardDescription>{props.step.description}</CardDescription>
    </CardHeader>
    <CardContent class="space-y-4">
      <ul class="grid gap-2 text-xs text-muted-foreground">
        <For each={props.step.bullets}>{(item) => <li>• {item}</li>}</For>
      </ul>

      <Show when={props.step.mode === "council"}>
        <div class="space-y-2">
          <Button size="sm" onClick={() => props.onRunFlow("council")} disabled={props.running !== null}>
            {props.running === "council" ? "Running Council..." : (props.step.actionLabel ?? "Run Council")}
          </Button>
          <Show when={props.councilOutput}>
            <pre class="whitespace-pre-wrap rounded-md border border-border bg-muted/40 p-3 text-xs text-foreground">
              {props.councilOutput}
            </pre>
          </Show>
        </div>
      </Show>

      <Show when={props.step.mode === "multimodal"}>
        <div class="space-y-2">
          <Button size="sm" onClick={() => props.onRunFlow("multimodal")} disabled={props.running !== null}>
            {props.running === "multimodal"
              ? "Running Multimodal..."
              : (props.step.actionLabel ?? "Run Multimodal Demo")}
          </Button>
          <Show when={props.multimodalOutput}>
            <pre class="whitespace-pre-wrap rounded-md border border-border bg-muted/40 p-3 text-xs text-foreground">
              {props.multimodalOutput}
            </pre>
          </Show>
        </div>
      </Show>

      <Show when={props.step.id === "wrap"}>
        <div class="space-y-2">
          <Button size="sm" onClick={() => props.onMarkComplete()} disabled={props.completed}>
            {props.completed ? "Completed" : (props.step.actionLabel ?? "Mark Complete")}
          </Button>
          <p class="text-xs text-muted-foreground">You can restart onboarding from this page any time.</p>
        </div>
      </Show>

      <Show when={props.error}>
        <div class="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {props.error}
        </div>
      </Show>

      <div class="flex flex-wrap items-center gap-2 pt-2">
        <Button size="sm" variant="outline" onClick={() => props.onPrev()} disabled={!props.canPrev}>
          Back
        </Button>
        <Button size="sm" variant="outline" onClick={() => props.onNext()} disabled={!props.canNext}>
          Next
        </Button>
        <Button size="sm" variant="ghost" onClick={() => props.onSkip()}>
          Skip for now
        </Button>
        <Button size="sm" variant="ghost" onClick={() => props.onRestart()}>
          Restart
        </Button>
      </div>
    </CardContent>
  </Card>
);
