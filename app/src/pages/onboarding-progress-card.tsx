import { type Component, Show } from "solid-js";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface OnboardingProgressCardProps {
  progress: number;
  completed: boolean;
  skipped: boolean;
}

/** Progress summary card for onboarding. */
export const OnboardingProgressCard: Component<OnboardingProgressCardProps> = (props) => (
  <Card>
    <CardHeader>
      <CardTitle>5-Minute Onboarding</CardTitle>
      <CardDescription>
        Two guided demos (Workers Council + Multimodal Workflow). Total time: ~5 minutes.
      </CardDescription>
    </CardHeader>
    <CardContent class="space-y-4">
      <div class="flex items-center justify-between text-xs text-muted-foreground">
        <span>Progress</span>
        <span>{props.progress}%</span>
      </div>
      <div class="h-2 rounded-full bg-muted overflow-hidden">
        <div class="h-full bg-primary" style={{ width: `${props.progress}%` }} />
      </div>
      <Show when={props.completed}>
        <div class="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-700">
          Onboarding complete. You can restart at any time.
        </div>
      </Show>
      <Show when={props.skipped && !props.completed}>
        <div class="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-800">
          Onboarding is paused. Resume when you are ready.
        </div>
      </Show>
    </CardContent>
  </Card>
);
