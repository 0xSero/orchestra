import { type Component, For } from "solid-js";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { OnboardingStep } from "./onboarding-steps";

interface OnboardingStepListProps {
  steps: OnboardingStep[];
  currentStep: number;
  onSelectStep: (index: number) => void;
}

/** Step list sidebar for onboarding. */
export const OnboardingStepList: Component<OnboardingStepListProps> = (props) => (
  <Card>
    <CardHeader>
      <CardTitle class="text-sm">Steps</CardTitle>
    </CardHeader>
    <CardContent class="space-y-2">
      <For each={props.steps}>
        {(stepItem, index) => (
          <button
            class={cn(
              "w-full rounded-md px-3 py-2 text-left text-xs transition",
              index() === props.currentStep
                ? "bg-primary/10 text-primary border border-primary/30"
                : "border border-transparent hover:border-border hover:bg-muted/40",
            )}
            onClick={() => props.onSelectStep(index())}
          >
            <div class="flex items-center justify-between">
              <span class="font-semibold">{stepItem.title}</span>
              <span class="text-[10px] text-muted-foreground">{stepItem.estimate}</span>
            </div>
            <div class="text-[11px] text-muted-foreground mt-1">{stepItem.description}</div>
          </button>
        )}
      </For>
    </CardContent>
  </Card>
);
